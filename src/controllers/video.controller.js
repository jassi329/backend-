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