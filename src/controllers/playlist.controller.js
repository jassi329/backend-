import mongoose, { isValidObjectId } from "mongoose";
import { Playlist } from "../models/playlist.model.js";
import { Video } from "../models/video.model.js"
import { User } from "../models/user.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const createPlaylist = asyncHandler(async(req, res) => {
 
    const { name, description } = req.body
    const owner = req.user?._id

    if(!name || name.trim() === ""){
        throw new ApiError(400, "Playlist name is required")
    }
    if(!description || description.trim() === ""){
        throw new ApiError(400, "Playlist description is required")
    }

    if(!owner){
        throw new ApiError(401, "Unauthorized: User not logged in to create a playlist")
    }

    const playlist = await Playlist.create({
        name, 
        description, 
        Videos: [],
        owner
    })

    if(!playlist){
        throw new ApiError(500, "Failed to create playlist")
    }

    return res
        .status(200)
        .json(
            new ApiResponse(
                201,
                playlist, 
                "Playlist created successfully"
            )
        )
})

const getUserPlaylists = asyncHandler(async(req, res) => {

    const { userId } = req.params

    if(!isValidObjectId(userId)){
        throw new ApiError(400, "Invalid user ID")
    }

    const user = await User.findById(userId)
    if(!user){
            throw new ApiError(404, "User not found")
    }

    const playlists = await Playlist.aggregate([
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
                owner: { $first: "$ownerDetails"}
            }
       },
       {
            $project: {
                ownerDetails: 0,
            }
       },
       {
            $sort: {createdAt: -1}
       }
    ])

    if(!playlists || playlists.length() === 0){
        return res.status(200).json(
                    new ApiResponse(200, [], "No playlists found for this user")
                )
    }
    
    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                [],
                "USer playlist fetched successfully"
            )
        )
})

const addVideoToPlaylist = asyncHandler(async (req, res) => {
    const { playlistId, videoId } = req.params
    const userId = req.user?._id

    if (!isValidObjectId(playlistId) || !isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid playlist ID or video ID")
    }
    if (!userId) {
        throw new ApiError(401, "Unauthorized: User not logged in")
    }

    const playlist = await Playlist.findById(playlistId);
    if (!playlist) {
        throw new ApiError(404, "Playlist not found");
    }

    const video = await Video.findById(videoId);
    if (!video) {
        throw new ApiError(404, "Video not found");
    }

    if (playlist.owner.toString() !== userId.toString()) {
        throw new ApiError(403, "You are not authorized to modify this playlist");
    }

    const updatedPlaylist = await Playlist.findByIdAndUpdate(
        playlistId,
        {
            $addToSet: { videos: videoId } 
        },
        { new: true } 
    );

    if (!updatedPlaylist) {
        throw new ApiError(500, "Failed to add video to playlist");
    }

    return res
        .status(200)
        .json(new ApiResponse(200, updatedPlaylist, "Video added to playlist successfully"));
});

const removeVideoFromPlaylist = asyncHandler(async (req, res) => {
    const { playlistId, videoId } = req.params; 
    const userId = req.user?._id;            

    if (!isValidObjectId(playlistId) || !isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid playlist ID or video ID");
    }
    if (!userId) {
        throw new ApiError(401, "Unauthorized: User not logged in");
    }

    const playlist = await Playlist.findById(playlistId);
    if (!playlist) {
        throw new ApiError(404, "Playlist not found");
    }

    const video = await Video.findById(videoId);
    if (!video) {
        throw new ApiError(404, "Video not found");
    }

    if (playlist.owner.toString() !== userId.toString()) {
        throw new ApiError(403, "You are not authorized to modify this playlist");
    }

    const updatedPlaylist = await Playlist.findByIdAndUpdate(
        playlistId,
        {
            $pull: { videos: videoId } 
        },
        { new: true } 
    );

    if (!updatedPlaylist) {
        throw new ApiError(500, "Failed to remove video from playlist");
    }

    return res
        .status(200)
        .json(new ApiResponse(200, updatedPlaylist, "Video removed from playlist successfully"));
})

const deletePlaylist = asyncHandler(async (req, res) => {
    const { playlistId } = req.params; 
    const userId = req.user?._id;     

    if (!isValidObjectId(playlistId)) {
        throw new ApiError(400, "Invalid playlist ID");
    }
    if (!userId) {
        throw new ApiError(401, "Unauthorized: User not logged in");
    }

    const playlist = await Playlist.findById(playlistId);

    if (!playlist) {
        throw new ApiError(404, "Playlist not found");
    }

    if (playlist.owner.toString() !== userId.toString()) {
        throw new ApiError(403, "You are not authorized to delete this playlist");
    }

    const deletedPlaylist = await Playlist.deleteOne({ _id: playlistId });

    if (deletedPlaylist.deletedCount === 0) { 
        throw new ApiError(500, "Failed to delete playlist");
    }

    return res
        .status(200)
        .json(new ApiResponse(200, null, "Playlist deleted successfully"));
})

const updatePlaylist = asyncHandler(async (req, res) => {
    const { playlistId } = req.params
    const { name, description } = req.body
    const userId = req.user?._id

    if (!isValidObjectId(playlistId)) {
        throw new ApiError(400, "Invalid playlist ID")
    }
    if (!name && !description) {
        throw new ApiError(400, "At least one field (name or description) is required for update")
    }
    if (!userId) {
        throw new ApiError(401, "Unauthorized: User not logged in")
    }

    const playlist = await Playlist.findById(playlistId)

    if (!playlist) {
        throw new ApiError(404, "Playlist not found")
    }

    if (playlist.owner.toString() !== userId.toString()) {
        throw new ApiError(403, "You are not authorized to update this playlist")
    }

    const updatedPlaylist = await Playlist.findByIdAndUpdate(
        playlistId,
        {
            $set: {
                name: name || playlist.name,      
                description: description || playlist.description 
            }
        },
        { new: true, runValidators: true } 
    );

    if (!updatedPlaylist) {
        throw new ApiError(500, "Failed to update playlist")
    }

    return res
        .status(200)
        .json(new ApiResponse(200, updatedPlaylist, "Playlist updated successfully"));
})


export {
    createPlaylist,
    getUserPlaylists,
    addVideoToPlaylist,
    removeVideoFromPlaylist,
    deletePlaylist,
    updatePlaylist

}