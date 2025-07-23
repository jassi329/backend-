import { v2 as cloudinary} from 'cloudinary';
import fs from "fs"


cloudinary.config({ 
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME, 
        api_key: process.env.CLOUDINARY_API_KEY, 
        api_secret: process.env.CLOUDINARY_API_SECRET 
});

const uploadOnCloudinary = async (localFilePath) => {
    try{
        if(!localFilePath) return null
        //upload file in cloudinary
        const response = await cloudinary.uploader.upload(localFilePath, {
            resource_type: "auto"
        })
        //file has been uploaded
        //console.log("file is uploaded on cloudinary", response.url);
        fs.unlinkSync(localFilePath)
        return response
    }catch(error){

        console.log("cloudinary upload error", error);

        if(fs.existsSync(localFilePath)){
            fs.unlinkSync(localFilePath)// remove the locally saved file as the operation got failed
        } 

        return null
    }
}

const deleteFromCloudinary = async(publicId, resourceType) => {
    try {
        if(!publicId)
            return null
        const response = await cloudinary.uploader.destroy(publicId, {
            resource_type: resourceType
        })
        console.log("deleted ${resourceType} with public id ${publicId}: ", response)
        return response
    } catch (error) {
        console.error("failed to delete")
        return null
    }
}


export {uploadOnCloudinary, deleteFromCloudinary}