const express = require('express');
const { OpenAI } = require('openai');
const multer = require('multer');
const dotenv = require('dotenv');
const cors = require('cors');
const Jimp = require('jimp');
const path = require('path');

// --- CONFIGURATION ---
dotenv.config();
const app = express();
const port = 3001;

if (!process.env.OPENAI_API_KEY) {
    console.error("FATAL ERROR: OPENAI_API_KEY is not set in the .env file.");
    process.exit(1);
}

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// --- MIDDLEWARE ---
app.use(cors());
app.use(express.static(__dirname)); // Serve files from the root directory

// --- IMAGE PROCESSING ---
async function processImageForDalle(buffer) {
    const image = await Jimp.read(buffer);
    image.contain(1024, 1024, Jimp.HORIZONTAL_ALIGN_CENTER | Jimp.VERTICAL_ALIGN_MIDDLE);
    return await image.getBufferAsync(Jimp.MIME_PNG);
}
async function processMaskForDalle(buffer) {
    const maskImage = await Jimp.read(buffer);
    const background = new Jimp(1024, 1024, 0x000000FF); // Opaque Black
    maskImage.scaleToFit(1024, 1024);
    const x = (1024 - maskImage.bitmap.width) / 2;
    const y = (1024 - maskImage.bitmap.height) / 2;
    background.composite(maskImage, x, y);
    background.scan(0, 0, 1024, 1024, function (x, y, idx) {
        if (this.bitmap.data[idx + 3] > 0) {
            this.bitmap.data[idx + 3] = 0; // Make transparent
        }
    });
    return await background.getBufferAsync(Jimp.MIME_PNG);
}

// --- API ENDPOINT ---
const storage = multer.memoryStorage();
const upload = multer({ storage });

app.post('/generate-image', upload.fields([{ name: 'image', maxCount: 1 }, { name: 'mask', maxCount: 1 }]), async (req, res) => {
    try {
        console.log("Received request to generate image...");
        if (!req.files.image || !req.files.mask || !req.body.prompt) {
            return res.status(400).json({ message: 'Image, mask, and prompt are required.' });
        }
        console.log(`Prompt: "${req.body.prompt}"`);

        const [processedImageBuffer, processedMaskBuffer] = await Promise.all([
            processImageForDalle(req.files.image[0].buffer),
            processMaskForDalle(req.files.mask[0].buffer)
        ]);
        
        const response = await openai.images.edit({
            image: processedImageBuffer,
            mask: processedMaskBuffer,
            prompt: req.body.prompt,
            n: 1,
            size: "1024x1024",
        });

        console.log("Successfully generated image from DALL-E.");
        res.json({ url: response.data[0].url });

    } catch (error) {
        const errorMessage = error.response ? JSON.stringify(error.response.data.error.message, null, 2) : error.message;
        console.error('Error calling OpenAI API:', errorMessage);
        res.status(500).json({ message: `Failed to generate image: ${errorMessage}` });
    }
});

// --- START SERVER ---
app.listen(port, () => {
    console.log(`Server is running. Open http://localhost:${port} in your browser.`);
});