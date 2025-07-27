import mongoose, { isValidObjectId } from "mongoose";
import { Tweet } from "../models/tweet.model.js";
import { User } from "../models/user.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { Like } from "../models/like.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { isValidElement } from "react";


const createTweet = asyncHandler(async(req, res) => {

    const { content } = req.body
    const owner = req.user?._id

    if(!content || content.trim() === ""){
        throw new ApiError(400, "Tweet content cannot be empty")
    }

    if(!owner){
        throw new ApiError(401, "unauthorized: User not logged in to create a tweet")
    }

    const tweet = await Tweet.create(
        content,
        owner
    )

    if(!tweet){
        throw new ApiError(500, "Failed to create tweet")
    }

    const createTweet = await Tweet.findById(tweet._id).populate(
        "owner",
        "username fullname avatar"
    )

    return res
        .status(201)
        .json(
            new ApiResponse(
                201, createTweet, "Tweet created succssfully"
            )
        )
})

const getUserTweet = asyncHandler(async(req, res) => {
    const { userId } = req.params
    const { page = 1, limit = 10 } = req.query

    if(!isValidObjectId(userId)){
        throw new ApiError(400, "Invalid user ID")
    }

    const user = await User.findById(userId)
    if(!user){
        throw new ApiError(404, "user not found")
    }

    const aggregateTweets = Tweet.aggregate([
        {
            $match: {
                owner: new mongoose.Types.ObjectId(userId)
            }
        },
        {
            $lookup: {
                from: "users",
                localField: "owner",
                foreignField: "_id",
                as: "pwnerDetails",
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
                owner: { $first: "$ownerDetails"}
            }
        },
        {
            $project: {
                ownerDetails: 0
            }
        },
        {
            $sort: {createdAt: -1}
        }
    ])

    const options = {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        customLabels: {
            docs: 'tweets',
            totalDocs: 'totalTweets'
        }
    }

    const result = await Tweet.aggregatePaginate(aggregateTweets, options)

    if(!result.docs || result.docs.length === 0){
        return res
            .status(200)
            .json(
                new ApiResponse(
                    200, { tweets: [], ...result}, "No tweets found for this user"
                )
            )
    }

    return res
        .status(200)
        .json(
            new ApiResponse(
                200, result, "User tweets fetched successfully"
            )
        )
})

const updateTweet = asyncHandler(async(req, res) => {

    const { tweetId } = req.params
    const { content } = req.body
    const userId = req.user?._id

    if(!isValidObjectId(tweetId)){
        throw new ApiError(400, "Invalid tweet ID")
    }

    if(!content || content.trim() === ""){
        throw new ApiError(400, "Tweet content cannot be empty")
    }

    if(!userId){
        throw new ApiError(401, "Unauthorized: User not logged in")
    }

    const tweet = await tweet.findById(tweetId)

    if(tweet.owner.toString() !== userId.toString()){
        throw new ApiError(403, "You are not authorized to update this tweet")
    }

    tweet.content = content
    await tweet.save({validateBeforeSave: true})

    const updatedTweet = await Tweet.findById(tweet._id).populate(
        "owner",
        "username fullname avatar"
    )

    return res
        .status(200)
        .json(
            new ApiResponse(
                200, updatedTweet, "Tweet updated successfully"
            )
        )
})

const deleteTweet = asyncHandler(async(req, res) => {

    const { tweetId } = req.params
    const userId = req.user?._id

    if(!isValidObjectId(tweetId)){
        throw new ApiError(400, "Invalid tweet ID")
    }
    if(!userId){
        throw new ApiError(401, "Unauthorized: User not logged in")
    }

    const tweet = await Tweet.findById(tweetId)

    if(!tweet){
        throw new ApiError(404, "Tweet not found")
    }

    if(tweet.owner.toString() !== userId.toString()){
        throw new ApiError(403, "You are not authorized to delete this tweet")
    }

    const deletedTweet = await Tweet.deleteOne({_id: tweetId})

    if(!deletedTweet.deletedCount){
        throw new ApiError(500, "Failed to delete tweet")
    }

    await Like.deleteMany({ tweet: tweetId })

    return res  
        .status(200)
        .json(
            new ApiResponse(
                200, null, "Tweet deleted successfully"
            )
        )
})

export {
    createTweet,
    getUserTweet,
    updateTweet,
    deleteTweet

}