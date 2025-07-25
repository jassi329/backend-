import mongoose, { isValidObjectId } from "mongoose";
import { Video } from "../models/video.model.js";
import { User } from "../models/user.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { uploadOnCloudinary, deleteFromCloudinary } from "../utils/cloudinary.js";
import { Comment } from "../models/comment.model.js";
import { Like } from "../models/like.model.js";

const getAllVideos = asyncHandler(async(req, res) => {
    const { page = 1, limit = 10, query, sortBy, sortType, userId} = req.query

    const pipeline = []

    //match based on query and userId
    const matchConditions = {}

    //filter by title or description if 'query' is provided
    if(query){
        matchConditions.$or = [
            {title: {$regex: query, $options: "i"}},
            {description: {$regex: query, $options: "i"}}
        ]
    }

    //if userId is provided, filter videos by owner
    if(userId){
        if(!isValidObjectId(userId)){
            throw new ApiError(400, "Invalid userId provided");
        }

        //converting it to mongoose ObjectId
        matchConditions.owner = new mongoose.Types.ObjectId(userId)
    }

    matchConditions.isPublished = true

    //if any match conditions are set, add a $match stage to the pipeline
    if(Object.keys(matchConditions).length > 0){
        pipeline.push({
            $match: matchConditions
        })
    }

    //stage 2: perform a lookup to get owner for each video
    pipeline.push(
        {
            $lookup: {
                from: "users",
                localField: "owner",
                foreignField: "_id",
                as: "ownerDetails", 
                pipeline: [
                    {
                        $project: {
                            username: 1,
                            fullname: 1,
                            avatar: 1,
                            _id: 1
                    }
                }
                ]
            }
        },
        {
            $addFields: {
                owner: {
                    $first: "$ownerDetails" // Deconstruct the 'ownerDetails' array to get the first (and only) owner object
                }
            }
        },
        {
            $project: {
                ownerDetails: 0
            }
        }
    )

    //stage 3: implementing sorting based on 'sortby' and 'sorttype'
    const sort = {}
    const effectiveSortBy = sortBy || "createdAt"
    const effectiveSortType = sortType === "asc" ? 1 : -1

    sort[effectiveSortBy] = effectiveSortType
    pipeline.push({
        $sort: sort
    })

    //stage 4: Pagination options for mongoose-aggregate-paginate-v2
    const options = {
        page: parseInt(page, 10), //convert page to int
        limit: parseInt(limit, 10) //convert limit to int
    }

    try {
        //create an aggregation object from the pipeline
        const videoAggregate = Video.aggregate(pipeline)
        // Apply pagination using the mongooseAggregatePaginate plugin on the Video model
        const result = await Video.aggregatePaginate(videoAggregate, options)
    
        //check if no videos were found
        if(!result.docs || result.docs.length === 0){
            return res.status(200)
            .json(
                new ApiResponse(200, {videos: [], ...result}, "no videos found matching your criteria")
            )           
        }
    
        return res
            .status(200)
            .json(new ApiResponse(200, result, "videos fetched successfully"))
    
    } catch (error) {
        console.error("Error fetching videos", error)

        throw new ApiError(
            500, 
            error.message || "something went wrong while fetching videos"
        )
    }
})

const publishAVideo = asyncHandler(async(req, res) => {
    const {title, description} = req.body

    if(!title || title.trim() === ""){
        throw new ApiError(400, "Title is required")
    }
    if(!description || description.trim() === ""){
        throw new ApiError(400, "description is required")
    }

    const videoFileLocalPath = req.files?.videoFile?.[0]?.path;
    const thumbnailLocalPath = req.files.thumbnail?.[0]?.path;

    if(!videoFileLocalPath){
        throw new ApiError(400, "Video file is required")
    }
    if(!thumbnailLocalPath){
        throw new ApiError(400, "thumbnail is required")
    }

    const videoFile = await uploadOnCloudinary(videoFileLocalPath);
    const thumbnail = await uploadOnCloudinary(thumbnailLocalPath)

    if(!videoFile?.url){
        throw new ApiError(500, "Failed to upload video file on cloudinary")
    }
    if(!thumbnail?.url){
        if(videoFile?.public_id){
            await deleteFromCloudinary(videoFile.public_id, "video")
        }
        throw new ApiError(500, "failed to upload thumbnail on cloudinary")
    }

    const duration = videoFile.duration || 0;

    const video = await Video.create(
        {
            title, 
            description,
            videoFile: videoFile.url,
            thumbnail: thumbnail,url,
            duration,
            owner: req.user?._id,
            isPublished: true
        }
    )

    if(!video){
        //if video creation fails, deleting it from cloudinary
        if(videoFile?.public_id){
            await deleteFromCloudinary(videoFile.public_id, "video")
        }
        if(thumbnail?.public_id){
            await deleteFromCloudinary(thumbnail.public_id, "image")
        }
        throw new ApiError(500, "failed to publish video");
    }

    //video is finally created 
    const createdVideo = await Video.findById(video._id).populate(
        "owner",
        "username fullname avatar"
    )

    return res
        .status(200)
        .json(
            new ApiResponse(201, createdVideo, "videpo Published Successfully")
        )
})

//controller to get single video by its id
const getVideoById = asyncHandler(async(req, res) => {

    const { videoId } = req.params

    if(!isValidObjectId(videoId)){
        throw new ApiError(400, "Invalid video ID")
    }

    // Aggregate to find the video and populate its owner's details
    const video = await Video.aggregate([
        {
            $match: {
                _id: new mongoose.Types.ObjectId(videoId)
            }
        },
        {
            $lookup: {
                from: "users",
                localField: "owner",
                foreignField: "_id",
                as: "owner",
                pipeline: [
                    {
                        $project: {
                            username: 1, 
                            fullname: 1, 
                            avatar: 1,
                        }
                    }
                ]
            }
        },
        {
            $addFields: {
                owner: {$first: "$owner"},
                isLiked: {
                    $cond: {
                        if: { $in: [req.user?._id, "$likes.likedBy"]},
                        then: true,
                        else: false
                    }
                }
            }
        },
        {
            $project: {
                videoFile: 1,
                thumbnail: 1,
                title: 1, 
                description: 1,
                duration: 1,
                views: 1,
                isPublished: 1,
                owner: 1,
                createdAt: 1,
                updatedAt: 1,
                isLiked: 1
            }
        }
    ])

    //checking if video is found
    if(!video || video.length === 0){
        throw new ApiError(404, "Video not found")
    }

    const videoFound = video[0]

    if(req.user && videoFound.owner?._id.toString() !== req.user._id.toString()){
        await Video.findByIdAndUpdate(
            videoId,
            { $inc: { views: 1 }}, //incrementing views by 1
            { new: true }//return the updated document
        )
    }

    //add video to authenticated user's watch history
    if(req.user){
        await User.findByIdAndUpdate(
            req.user._id,
            {
                $addToSet: {
                    watchHistory: videoId
                }
            },
            { new: true }
        )
    }

    return res
        .status(200)
        .json(
            new ApiResponse(200, videoFound, "Video fetched successfully")
        )
})

const updateVideo = asyncHandler(async(req, res) => {

    const { videoId } = req.params

    const {title, description} = req.body

    if(!isValidObjectId(videoId)){
        throw new ApiError(400, "Invalid video ID")
    }

    if(!title && !description && !req.files && (!req.files || !req.files.thumbnail)){
        throw new ApiError(400, "At least one field is required for update")
    }

    const video = await Video.findById(videoId)

    if(!video){
        throw new ApiError(404, "Video not found")
    }

    if(video.owner.toString() !== req.user?._id.toString()){
        throw new ApiError(403, "You are not authorized to update this video")
    }

    let newThumbnailUrl = video.thumbnail

    if(req.file?.path){
        const oldThumbnailPublicId = video.thumbnail.split("/").pop().split(".")[0]
        if(oldThumbnailPublicId){
            await deleteFromCloudinary(oldThumbnailPublicId, "image")
        }

        const uploadedThumbnail = new uploadOnCloudinary(req.file.path)
        if(!uploadedThumbnail?.url){
            throw new ApiError(500, "failed to upload new thumbnail")
        }
        newThumbnailUrl = uploadedThumbnail.url
    }

    else if(req.files?.thumbnail?.[0]?.path){
        const oldThumbnailPublicId = video.thumbnail.split("/").pop().split(".")[0]
        if(oldThumbnailPublicId){
            await deleteFromCloudinary(oldThumbnailPublicId, "image")
        }

        const uploadedThumbnail = await uploadOnCloudinary(req.files.thumbnail[0].path)
        if(!uploadedThumbnail?.url){
            throw new ApiError(500, "failed to upload new thumbnail")
        }

        newThumbnailUrl = uploadedThumbnail.url
    }
})


export {
    getAllVideos,
    publishAVideo,
    getVideoById,
    updateVideo

}