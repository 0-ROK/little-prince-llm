import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import {
    BedrockRuntimeClient,
    ConverseCommand,
    Message,
} from '@aws-sdk/client-bedrock-runtime';
import dotenv from 'dotenv'
import fs from 'fs'
import pdf from 'pdf-parse'
import { Pinecone } from '@pinecone-database/pinecone';
import chunkText from './utils/chunkText';
import OpenAi from 'openai'

dotenv.config();

const app = express();
const port = 8080;

// CORS 설정
app.use(cors({
    origin: 'http://localhost:3000',
    credentials: true
}));

app.use(bodyParser.json());

if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    throw new Error("AWS credentials not found");
}
const inferenceModelId = "anthropic.claude-3-sonnet-20240229-v1:0";
const llmClient = new BedrockRuntimeClient({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});


const embeddingModelId = 'text-embedding-ada-002';
const embeddingClient = new OpenAi({
    apiKey: process.env.OPENAI_API_KEY,
});

if (!process.env.PINECONE_API_KEY) {
    throw new Error("Pinecone API key not found");
}
const pinecone = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY,
});
const vectorDbClient = pinecone.index('little-prince');



async function main() {
    const text = await readPdf();
    const chunkedText = chunkText(text, 350);

    app.post('/generate', async (req: express.Request<{}, {}, { userMessage: string }>, res: express.Response) => {

        const { userMessage } = req.body;

        const embeddingMessage = await embeddingText(userMessage ?? '');

        const result = await vectorDbClient
            .namespace('france')
            .query({
                topK: 2,
                vector: embeddingMessage
            });


        console.log(result)


        const conversation: Message[] = [
            {
                role: "user",
                content: [{ text: '다음의 어린왕자 소설 원문을 보고 제 답변에 보다 풍성한 문학적 해설을 제공해주세요.' }],
            },
            {
                role: "assistant",
                content: [
                    { text: '다음에 제시되는 프랑스어 원문을 보고 사용자의 질문에 보다 풍성한 문학적 해설을 제공해주세요.' },
                    { text: '<system>사용자의 전제와 배경지식이 소설의 내용과 다르다면, 이를 부드럽게 언급하고 유사하게 생각할 수 있는 내용을 제시하세요.</system>' },
                    { text: '<system>답변은 반드시 한국어로 하십시오. 답변에 프랑스어를 포함하지 마십시오.</system>' },
                ]
            },
            {
                role: "user",
                content: [
                    ...result.matches.map((match) => {
                        if (match.id === '') return { text: '' }
                        if (isNaN(Number(match.id))) return { text: '' }
                        return { text: chunkedText[Number(match.id)] }
                    }),
                    { text: userMessage },
                ]
            },
        ];

        const command = new ConverseCommand({
            modelId: inferenceModelId,
            messages: conversation,
            inferenceConfig: { maxTokens: 4096, temperature: 0.5, topP: 0.9 },
        });

        try {
            const response = await llmClient.send(command);
            res.json({
                originalText: result.matches.map((match) => {
                    if (match.id === '') return { text: '' }
                    if (isNaN(Number(match.id))) return { text: '' }
                    return { text: chunkedText[Number(match.id)] }
                }),
                response: response
            });
        } catch (error) {
            res.status(500).json({ error });
        }
    });

    app.get('/embedding', async (req, res) => {
        const embeddingVectors = await Promise.all(chunkedText.map(async (chunk, index) => {
            const embeddingVector = await embeddingText(chunk);
            return embeddingVector;
        }));

        const result = await saveToVectorDB(embeddingVectors);
        res.json({ result });
    });

    app.get('/how-many-vectors', async (req, res) => {
        res.json({ result: chunkedText.length });
    });


    async function embeddingText(text: string) {
        const response = await embeddingClient.embeddings.create({
            model: embeddingModelId,
            input: text,
        })
        return response.data[0].embedding;
    }

    async function saveToVectorDB(vectors: number[][]) {

        const vectorsToInsert = vectors.map((vector, index) => ({
            id: `${index}`,
            values: vector,
        }));

        const result = await vectorDbClient.namespace('france').upsert(vectorsToInsert);

        return result
    }


    app.listen(port, () => {
        console.log(`Server running at http://localhost:${port}`);
    });
}

async function readPdf() {
    const filePath = './docs/st_exupery_le_petit_prince.pdf';
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdf(dataBuffer);
    return data.text;
}


main();



