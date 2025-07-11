const { OpenAI } = require('openai');
const busboy = require('busboy');
const Jimp = require('jimp');
const cors = require('cors');

// Initialize CORS middleware
const corsMiddleware = cors({
    origin: '*', // Allow all origins
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
});

// Helper to run middleware
const runMiddleware = (req, res, fn) => {
    return new Promise((resolve, reject) => {
        fn(req, res, (result) => {
            if (result instanceof Error) {
                return reject(result);
            }
            return resolve(result);
        });
    });
};

// Image processing functions (same as before)
async function processImageForDalle(buffer) {
    const image = await Jimp.read(buffer);
    image.contain(1024, 1024, Jimp.HORIZONTAL_ALIGN_CENTER | Jimp.VERTICAL_ALIGN_MIDDLE);
    return await image.getBufferAsync(Jimp.MIME_PNG);
}

async function processMaskForDalle(buffer) {
    const maskImage = await Jimp.read(buffer);
    const background = new Jimp(1024, 1024, 0x000000FF);
    maskImage.scaleToFit(1024, 1024);
    const x = (1024 - maskImage.bitmap.width) / 2;
    const y = (1024 - maskImage.bitmap.height) / 2;
    background.composite(maskImage, x, y);
    background.scan(0, 0, 1024, 1024, function (x, y, idx) {
        if (this.bitmap.data[idx + 3] > 0) this.bitmap.data[idx + 3] = 0;
    });
    return await background.getBufferAsync(Jimp.MIME_PNG);
}

// Main serverless function handler
module.exports = async (req, res) => {
    await runMiddleware(req, res, corsMiddleware);

    if (req.method !== 'POST') {
        return res.status(405).send('Method Not Allowed');
    }

    const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
    });

    const bb = busboy({ headers: req.headers });
    const formData = {};
    const fileBuffers = {};

    bb.on('file', (name, file) => {
        const chunks = [];
        file.on('data', (chunk) => chunks.push(chunk));
        file.on('end', () => fileBuffers[name] = Buffer.concat(chunks));
    });

    bb.on('field', (name, val) => formData[name] = val);

    bb.on('close', async () => {
        try {
            console.log("Vercel Function: Received request...");
            if (!fileBuffers.image || !fileBuffers.mask || !formData.prompt) {
                return res.status(400).json({ message: 'Image, mask, and prompt are required.' });
            }
            console.log(`Vercel Function: Prompt is "${formData.prompt}"`);

            const [processedImageBuffer, processedMaskBuffer] = await Promise.all([
                processImageForDalle(fileBuffers.image),
                processMaskForDalle(fileBuffers.mask)
            ]);
            
            console.log("Vercel Function: Sending to DALL-E...");
            const response = await openai.images.edit({
                image: processedImageBuffer,
                mask: processedMaskBuffer,
                prompt: formData.prompt,
                n: 1,
                size: "1024x1024",
            });

            console.log("Vercel Function: DALL-E success.");
            res.status(200).json({ url: response.data[0].url });

        } catch (error) {
            const errorMessage = error.response ? JSON.stringify(error.response.data) : error.message;
            console.error('Vercel Function Error:', errorMessage);
            res.status(500).json({ message: `Generation failed: ${errorMessage}` });
        }
    });

    req.pipe(bb);
};
