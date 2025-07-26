import mongoose, { isValidObjectId } from "mongoose";
import { Like } from "../models/like.model.js";
import { Video } from "../models/video.model.js";
import { Comment } from "../models/comment.model.js";
import { User } from "../models/user.model.js";
import { Tweet } from "../models/tweet.model.js"
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { use } from "react";

const toggleVideoLike = asyncHandler(async(req, res) => {
    
    const { videoId } = req.params
    const userId = req.user?._id

    if(!isValidObjectId(videoId)){
        throw new ApiError(400, "Invalid video ID")
    }
    if(!userId){
        throw new ApiError(401, "Unauthorized: User not logged in")
    }

    const video = await Video.findById(videoId)
    if(!video){
        throw new ApiError(404, "Video not found")
    }

    const existingLike = await Like.findOne({
        video: videoId,
        likedBy: userId
    })

    let message
    let like

    if(existingLike){
        await Like.deleteOne({_id: existingLike._id })
        message = "Video unliked successfully"
        like = null
    }
    else{
        like = await Like.create({
            video: videoId,
            likedBy: userId
        })
        message: "Video liked successfully"
    }

    return res
        .status(200)
        .json(
            new ApiResponse(
                200, 
                { isLiked: !!like, like}, message
            )
        )
})

const toggleCommentLike = asyncHandler(async(req, res) => {
    
    const { CommentId } = req.params
    const userId = req.user?._id

    if(!isValidObjectId(CommentId)){
        throw new ApiError(400, "Invalid object ID")
    }

    if(!userId){
        throw new ApiError(401, "Unauthorized: User not logged in")
    }

    const comment = await Comment.findById(CommentId)
    if(!comment){
        throw new ApiError(404, "Comment not found")
    }

    const existingLike = await Like.findOne({
        comment: CommentId,
        likedBy: userId
    })

    let message
    let like

    if(existingLike){
        await Like.deleteOne({_id: existingLike._id})
        message: "Comment unliked successfully"
        like: null
    }else{
        like = await Like.create({
            comment: CommentId,
            likedBy: userId
        })
        message: "Comment liked successfully"
    }

    return res  
        .status(200)
        .json(
            new ApiResponse(
                200, {isLiked: !!like, like}, message
            )
        )

})

const toggleTweetLike = asyncHandler(async(req, res) => {

    const { tweetId } = req.params
    const userId = req.user?._id

    if(!isValidObjectId(tweetId)){
        throw new ApiError(400, "Invalid tweet ID")
    }

    if(!userId){
        throw new ApiError(401, "Unauthorized: User not logged in")
    }

    const tweet = await Comment.findById(CommentId)
    if(!tweet){
        throw new ApiError(404, "tweet not found")
    }

    const existingLike = await Like.findOne({
        comment: tweetId,
        likedBy: userId
    })

    let message
    let like

    if(existingLike){
        await Like.deleteOne({_id: existingLike._id})
        message: "Tweet unliked successfully"
        like: null
    }else{
        like = await Like.create({
            comment: tweetId,
            likedBy: userId
        })
        message: "Tweet liked successfully"
    }

    return res  
        .status(200)
        .json(
            new ApiResponse(
                200, {isLiked: !!like, like}, message
            )
        )
})

const getLikedVideo = asyncHandler(async(req, res) => {

    const userId = req.user?._id

    if(!userId){
        throw new ApiError(401, "Unauthorized: User not logged in");
    }

    const likedvideos = await Like.aggregate([
        {
            $match: {
                likedBy: new mongoose.Types.ObjectId(userId),
                video: {$exists: true, $ne: null }
            }
        },
        {
            $lookup: {
                from: "videos",
                localField: "video",
                foreignField: "_id",
                as: "videoDetails",
                pipeline: [
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
                                        avatar: 1
                                    }
                                }
                            ]
                        }
                    },
                    {
                        $addFields: {
                            owner: {
                                $first: "$ownerDetails"
                            }
                        }
                    },
                    {
                        $project: {
                            videofile: 1, 
                            thumbnail: 1,
                            title: 1,
                            description: 1,
                            duration: 1, 
                            views: 1,
                            isPublished: 1,
                            owner: 1,
                            createdAt: 1
                        }
                    }
                ]
            }
        },
        {
            // Deconstruct the 'videoDetails' array (each like will correspond to one video)
            $unwind: "$videoDetails"
        },
        {
            // Project the final output to only include the video details
            $replaceRoot: { newRoot: "$videoDetails"}
        }
    ])

    return res  
        .status(200)
        .json(
            new ApiResponse(
                200, 
                likedvideos, 
                "liked videos fetched successfully"
            )
        )
})

export {
    toggleVideoLike,
    toggleCommentLike,
    toggleTweetLike,
    getLikedVideo
}