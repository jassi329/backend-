import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js"
import { User } from "../models/user.model.js"
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken"
import { subscribe } from "diagnostics_channel";
import mongoose from "mongoose";


const generateAccessAndRefreshTokens = async(userId) => 
{
    try{
        const user = await User.findById(userId)
        const accessToken = user.generateAccessToken()
        const refreshToken = user.generateRefreshToken()   

        user.refreshToken = refreshToken
        await user.save({validateBeforeSave: false})

        return{accessToken, refreshToken}
    }
    catch(error){
        throw new ApiError(500, "something went wrong while generating refresh and access tokens")
    }
}


const registerUser = asyncHandler(async(req, res) => {
    
    //get user details from front end
    //validation
    //check if user already existed:username, email
    //check for images, check for avatar
    //upload on cloudinary
    //create user object - create entry in db
    //remove password and refresh token from response
    //chect for user creation
    //return res
    
    const {fullname, email, username, password} = req.body
    //console.log("email: ", email)
    

    if(
        [fullname, email, username, password].some((field) => field?.trim() === "" )
    ){
        throw new ApiError(400, "All fields are required")
    }

    const existedUSer = await User.findOne({
        $or: [{ username }, { email }]
    })

    if(existedUSer){
        throw new ApiError(409, "User with email pr username already existed")
    }
    console.log(req.files)

    const AvatarLocalPath = req.files?.avatar[0]?.path;
    //const coverImageLocalPath = req.files?.coverImage[0]?.path;

    let coverImageLocalPath;
    if(req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length > 0){
        coverImageLocalPath = req.files?.coverImage[0]?.path;
    }

    if(!AvatarLocalPath){
        throw new ApiError(400, "Avatar is required")
    }

    const avatar = await uploadOnCloudinary(AvatarLocalPath)
    const coverImage = await uploadOnCloudinary(coverImageLocalPath)

    if(!avatar){
        throw new ApiError(400, "Avatar is required")
    }

    const user = await User.create({
        fullname,
        avatar: avatar.url,
        coverImage: coverImage?.url || "",
        email, 
        password, 
        username: username.toLowerCase()
    })

    const createdUser = await User.findById(user._id).select(
        "-password -refreshToken"
    )

    if(!createdUser){
        throw new ApiError(500, "something went wrong while registering user")
    }

    return res.status(201).json(
        new ApiResponse(200, createdUser, "User registered successfully")
    )

})

const LoginUser = asyncHandler(async (req, res) => {
    //req body ->data
    //username or email
    //find the user
    //password check
    //access and refresh token
    //send cookies
    const {email, username, password} = req.body

    if(!(username || email)){
        throw new ApiError(400, "username or password is required")
    }

    const user = await User.findOne({
        $or: [{username}, {email}]
    })

    if(!user){
        throw new ApiError(404, "user does not exist")
    }

    const isPasswordValid = await user.isPasswordCorrect(password)

    if(!isPasswordValid){
        throw new ApiError(401, "Invalid User Credentials")
    }

    const {accessToken, refreshToken} = await generateAccessAndRefreshTokens(user._id)

    const LoggedInUser = await User.findById(user._id).select("-password -refreshToken")

    const options = {
        httpOnly: true,
        secure: true
    }

    return res.status(200).
    cookie("accessToken", accessToken, options).cookie("refreshToken", refreshToken, options).json(
        new ApiResponse(
            200,
            {
                user: LoggedInUser, accessToken, refreshToken
            },
            "user logged in Successfully"
        )
    )

})

const LogoutUser = asyncHandler(async(req, res) => {
    await User.findByIdAndUpdate(
        req.user._id,
        {
            $set: {
                refreshToken: undefined
            },   
        },
        {
            new: true
        }
    )

    const options = {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production"? true: false
    }

    return res.status(200).clearCookie("accessToken", options).clearCookie("refreshToken", options).json(new ApiResponse(200, {}, "User Logged Out"))
})

const refreshAccessToken = asyncHandler(async(req, res) => {
    const incomingRefreshToken = req.cookie.refreshToken || req.body.refreshToken
    
        if(!incomingRefreshToken){
            throw new ApiError(401, "unauthorize request")
        }
    
    try {
    
        const decodedToken = jwt.verify(
            incomingRefreshToken, 
            process.env.REFRESH_TOKEN_SECRET
        )
    
        const user = await User.findById(decodedToken?._id)
    
        if(!user){
            throw new ApiError(401, "Invalid refresh token")
        }
    
        if(incomingRefreshToken !== user?.refreshToken){
            throw new ApiError(401, "refresh token is expired or use")
        }
    
        const options = {
            httpOnly: true,
            secure: true
        }
    
        const {accessToken, newrefreshToken} = await generateAccessAndRefreshTokens(user._id)
    
        return res
        .status(200)
        .cookie("accessToken", accessToken)
        .cookie("refresh token", newrefreshToken)
        .json(
            new ApiResponse(
                200,
                {accessToken, refreshToken: newrefreshToken},
                "access token refreshed"
            )
        )
    } catch (error) {
        throw new ApiError(401, error?.message || "invalid refresh token")
    }
    
})

const changeCurrentPassword = asyncHandler(async(req, res) => {
    const {oldPassword, newPassword, /*confirmPassword*/} = req.body

    // if(!(newPassword === confirmPassword)){
    //     throw new ApiError(400, "confirm password does not match")
    // }

    const user = await User.findById(req.user?._id)
    await user.isPasswordCorrect(oldPassword)
   
    if(!isPasswordCorrect){
        throw new ApiError(400, "Invalid old password")
    }
    
    user.password = newPassword
    await user.save({validateBeforeSave: false})

    return res.status(200)
    .json(new ApiResponse(200, {}, "password changed successfully"))
})

const getCurrentUser = asyncHandler(async(req, res) => {
    return res.status(200)
    .json(new ApiResponse(200, req.user, "current user fetched successfully"))
})

const updateAccountDetails = asyncHandler(async(req, res) => {
    const {fullname, email} = req.body

    if(!(fullname || email)){
        throw new ApiError(400, "all fiels are required")
    }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                fullname,
                email: email,
            }
        },
        {new: true}
    ).select("-password")

    return res.status(200)
    .json(
        new ApiResponse(200, "account details updated successfully")
    )
})

const updateUserAvatar = asyncHandler(async(req, res) => {
    const avatarLocatPath = req.files?.path
    if(!avatarLocatPath){
        throw new ApiError(400, "Avatar file is missing")
    }

    const avatar = await uploadOnCloudinary(avatarLocatPath)

    if(!avatar.url){
        throw new ApiError(400, "Error while uploading on cover image")
    }

    const user = await User.findByIdAndUpdate(
        req.user?._id,

        {
            $set: {
                avatar: avatar.url
            }
        },
        {new: true}
    ).select("-password")

    return res.status(200)
    .json(
        new ApiResponse(200, user, "avatar Updated")
    )
})

const updateUserCoverImage = asyncHandler(async(req, res) => {
    const coverImageLocatPath = req.files?.path
    if(!coverImageLocatPath){
        throw new ApiError(400, "cover image file is missing")
    }

    const coverImage = await uploadOnCloudinary(coverImageLocatPath)

    if(!coverImage.url){
        throw new ApiError(400, "Error while uploading on cover image")
    }

    const user = await User.findByIdAndUpdate(
        req.user?._id,

        {
            $set: {
                coverImage: coverImage.url
            }
        },
        {new: true}
    ).select("-password")

    return res.status(200)
    .json(
        new ApiResponse(200, user, "cover Image Updated")
    )
})

const getUserChannelProfile = asyncHandler(async(req, res) => {
    const {username} = req.params

    if(!username?.trim()){
        throw new ApiError(400, "username is missing")
    }
        const channel = await User.aggregate([
            {
                $match: {
                    username: username?.toLowerCase()
                }
            },
            {
                $lookup:{
                    from: "subscriptions",
                    localField: "_id",
                    foreignField: "channel",
                    as: "subscribers"
                }
            },
            {
                $lookup:{
                    from: "subscriptions",
                    localField: "_id",
                    foreignField: "subscriber",
                    as: "subscribedTo"
                }
            },
            {
                $addFields:{
                    subscribersCount: {
                        $size: "$subscribers"
                    },
                    channelsSubscribedToCount: {
                        $size: "$subscribedTo"
                    },
                    isSubscribed: {
                        $condition: {
                            if: {$in: [req.user?._id, "subscribers.subscriber"]},
                            then: true,
                            else: false
                        }
                    }
                }
            },
            {
                $project: {
                    fullname: 1,
                    username: 1,
                    subscribersCount: 1,
                    channelsSubscribedToCount: 1,
                    isSubscribed: 1,
                    avatar: 1,
                    coverImage: 1,
                    email: 1
                }
            }
        ])

        if(!channel?.length){
            throw new ApiError(404, "channel does not exist")
        }

        return res.status(200)
        .json(
            new ApiResponse(200, channel[0], "user channel fetched successfully")
        )
}) 

const getWatchHistory = asyncHandler(async(req, res) => {
    const user = await User.aggregate([
       {
            $match: {
                _id: new mongoose.Types.ObjectId(req.user._id)
            }
       },
       {
            $lookup: {
                from: "videos",
                localField: "watchHistory",
                foreignField: "id",
                as: "watchHistory",
                pipeline: [
                    {
                        $lookup:{
                            from: "users",
                            localField: "owner",
                            foreignField: "_id",
                            as: "owner", 
                            pipeline: [
                                {
                                    $project: {
                                        fullname: 1,
                                        username: 1,
                                        avatar: 1
                                    }
                                }
                            ]
                        }
                    },
                    {
                        $addFields: {
                            owner: {
                                $first: "$owner"
                            }
                        }
                    }
                ]
            }
       }    
    ])

    return res.status(200)
    .json(
        new ApiResponse(
            200, 
            user[0].watchHistory,
            "watch history fetched successfully"
        )
    )
})

export {
    registerUser,
    LoginUser,
    LogoutUser,
    refreshAccessToken,
    changeCurrentPassword,
    getCurrentUser,
    updateAccountDetails,
    updateUserAvatar,
    updateUserCoverImage,
    getUserChannelProfile,
    getWatchHistory
}