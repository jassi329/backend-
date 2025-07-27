import mongoose, { isValidObjectId } from "mongoose";
import { User } from "../models/user.model";
import { Subscription } from "../models/subscription.model.js";
import { ApiError } from "../utils/ApiError.js"
import { ApiResponse } from "../utils/ApiResponse.js"
import { asyncHandler } from "../utils/asyncHandler.js"


const toogleSubscription = asyncHandler(async(req, res) => {

    const { channelId } = req.params
    const subscribedId = req.user?._id

    if(isValidObjectId(channelId)){
        throw new ApiError(400, "Invalid object ID")
    }
    if(!subscribedId){
        throw new ApiError(401, "Unauthorized: User not logged in")
    }

    if(channelId.toString() === subscribedId.toString()){
        throw new ApiError(400, "You cannot subscribe to your own channel")
    }

    const channel = await User.findById(channelId)
    if(!channel){
        throw new ApiError(404, "Channel not found")
    }

    const existingSubscription = await Subscription.findOne({
        channel: channelId,
        subscriber: subscribedId
    })

    let message
    let subscriptionStatus

    if(existingSubscription){
        await Subscription.deleteOne({ _id: existingSubscription._id})
        message: "Unsubscribed successfully"
        subscriptionStatus: false
    }else{
        const newSubscription = await Subscription.create({
            channel: channelId,
            subscriber: subscribedId
        })
        message: "Subscribed successfully"
        subscriptionStatus: true
        subscription: newSubscription
    }

    return res
        .status(200)
        .json(
            new ApiResponse(
                200, 
                { subscribed: subscriptionStatus },
                message
            )
        )
})

const getUserChannelSubscribers = asyncHandler(async(req, res) => {

    const { channelId } = req.params

    if(!isValidObjectId(channelId)){
        throw new ApiError(400, "Invalid object ID")
    }

    const channel = await User.findById(channelId)
    if(!channel){
        throw new ApiError(404, "Channel not found")
    }

    const subscribers = await Subscription.aggregate([
        {
            $match: {
                channel: new mongoose.Types.ObjectId(channelId)
            }
        },
        {
            $lookup: {
                from: "users", 
                localField: "subscriber", 
                foreignField: "_id",
                as: "subscriberInfo",
                pipeline: [
                    {
                        $project: {
                            username: 1,
                            fullname: 1,
                            avatar: 1,
                            email: 1
                        }
                    }
                ]
            }
        },
        {
            $unwind: "$subscriberInfo"
        },
        {
            $replaceRoot: { newRoot: "$subscriberInfo" }
        }
    ])

    return res
        .status(200)
        .json(new ApiResponse(
            200, 
            subscribers,
            "Subscribers fetched successfully"
        ))
})


export {
    toogleSubscription,
    getUserChannelSubscribers,
}