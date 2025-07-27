import mongoose, { isValidObjectId } from "mongoose";
import { Comment } from "../models/comment.model.js";
import { Video } from "../models/video.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js"

const getvideoComment = asyncHandler(async(req, res) => {

    const { videoId } = req.params
    const { page = 1, limit = 10} = req.query

    if(!isValidObjectId(videoId)){
        throw new ApiError(400, "Invalid video ID")
    }

    const video = await videoId.findById(videoId)
    if(!video){
        throw new ApiError(400, "Video not found")
    }

    const aggregateComments = Comment.aggregate([
        {
            $match: {
                video: new mongoose.Types.ObjectId(videoId)
            }
        },
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
                    $first: "$ownerDetails",
                }
            }
        },
        {
            $project: {
                ownerDetails: 0
            }
        },
        {
            $sort: {
                createdAt: -1
            }
        }
    ])
    
    const Options = {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        customLabels: {
            docs: 'comments',
            totalDocs: 'totalcomments'
        }
    }
    
    const result = await Comment.aggregatePaginate(aggregateComments, Options)
   
    if(!result || result.docs.length === 0){
        return res
            .status(200, { comments: [], ...result})
    }
})

const addComment = asyncHandler(async(req, res) => {

    const { videoId } = req.params
    const { content } = req.body

    const owner = req.user?._id

    if(!isValidObjectId(videoId)){
        throw new ApiError(400, "Invalid video ID")
    }
    if(!content || content.trim() === ""){
        throw new ApiError(400, "Comment content cannot be empty")
    }
    if(!owner){
        throw new ApiError(401, "Unauthorized: User not logged in to add a comment")
    }

    const video = await Video.findById(videoId)
    if(!video){
        throw new ApiError(404, "Video not found")
    }

    const comment = await Comment.create({
        content, 
        video: videoId,
        owner
    })

    if(!comment){
        throw new ApiError(500, "failed to add comment")
    }

    const createdComment = await Comment.findById(comment._id).populate(
        "owner",
        "username, avatar"
    )

    return res  
        .status(201)
        .json(
            new ApiResponse(
                201, createdComment, "Comment added successfully"
            )
        )
})

const updateComment = asyncHandler(async(req, res) => {

    const { commentId } = req.params
    const { content } = req.body

    const userId = req.user?._id

    if(!isValidObjectId(commentId)){
        throw new ApiError(400, "Invalid comment ID")
    }
    if(!content || content.trim() === ""){
        throw new ApiError(400, "Comment content cannot be empty")
    }
    if(!userId){
        throw new ApiError(401, "unauthorized: User not logged in")
    }

    const comment = await Comment.findById(commentId)

    if(!comment){
        throw new ApiError(404, "Comment not found")
    }

    if(comment.owner.toString() != userId.toString()){
        throw new ApiError(403, "You are not authorized to update this comment")
    }

    comment.content = content
    await comment.save( {validateBeforeSave: true })

    const updatedComment = await Comment.findById(comment._id).populate(
        "owner",

        "username avatar"
    )

    return res  
        .status(200)
        .json(
            new ApiResponse(200, updatedComment, "Comment updated successfully")
        )
})

const deleteComment = asyncHandler(async(req, res) => {

    const { commentId } = req.params
    const userId = req.user?._id

    if(isValidObjectId(commentId)){
        throw new ApiError(400, "Invalid object ID")
    }
    if(!userId){
        throw new ApiError(401, "unauthorized: User not logged in")
    }

    const comment = await Comment.findById(commentId)

    if(!comment){
        throw new ApiError(404, "Comment not found")
    }

    const video = await Video.findById(comment.video)
    if(comment.owner.toString() !== userId.toString() && video.owner.toString()){
        throw new ApiError(403, "you are not authorized to delete this comment")
    }

    const deleteResult = await comment.deleteOne({ _id: commentId})

    if(deleteResult.deleteCount === 0){
        throw new ApiError(500, "Failed to delete comment")
    }

    return res
        .status(200)
        .json(
            new ApiResponse(
                200, null, "Comment deleted successfully"
            )
        )
})


export {
    getvideoComment,
    addComment,
    updateComment,
    deleteComment
}
