import express from 'express';
import bodyParser from 'body-parser';
import {
    BedrockRuntimeClient,
    ConverseCommand,
    Message,
} from '@aws-sdk/client-bedrock-runtime';
import dotenv from 'dotenv'

dotenv.config();

const app = express();
const port = 8080;

app.use(bodyParser.json());

console.log(process.env.AWS_REGION);

const modelId = "anthropic.claude-3-sonnet-20240229-v1:0";

const userMessage = "어린왕자에 대해 소개해주세요.";
const conversation: Message[] = [
    {
        role: "user",
        content: [{ text: userMessage }],
    },
];

const command = new ConverseCommand({
    modelId,
    messages: conversation,
    inferenceConfig: { maxTokens: 512, temperature: 0.5, topP: 0.9 },
});

function main() {

    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
        throw new Error("AWS credentials not found");
    }

    const bedrockClient = new BedrockRuntimeClient({
        region: process.env.AWS_REGION,
        credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        },
    });

    app.get('/generate', async (req, res) => {
        try {
            const response = await bedrockClient.send(command);
            res.json({ response: response });
        } catch (error) {
            res.status(500).json({ error });
        }
    });

    app.listen(port, () => {
        console.log(`Server running at http://localhost:${port}`);
    });
}

main();



