import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import dotenv from 'dotenv'
import fs from 'fs'
import pdf from 'pdf-parse'
import { Pinecone } from '@pinecone-database/pinecone';
import chunkText from './utils/chunkText';
import OpenAI from 'openai'

dotenv.config();

const app = express();
const port = 8080;

// CORS 설정
app.use(cors({
    origin: 'http://localhost:3000',
    credentials: true
}));

app.use(bodyParser.json());

if (!process.env.OPENAI_API_KEY) {
    throw new Error("OpenAI API key not found");
}

const openaiClient = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const embeddingModelId = 'text-embedding-ada-002';
const chatModelId = 'gpt-4o-mini'; // 경제적이면서도 성능 좋은 모델

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


        // 관련 원문 텍스트 추출
        const relevantTexts = result.matches
            .map((match) => {
                if (match.id === '' || isNaN(Number(match.id))) return '';
                return chunkedText[Number(match.id)];
            })
            .filter(text => text.length > 0);

        // OpenAI Chat API 형식의 메시지 구성
        const messages = [
            {
                role: "system" as const,
                content:
                    `당신은 생텍쥐페리의 "어린왕자" 전문가입니다. 다음 프랑스어 원문을 참고하여 사용자의 질문에 풍부한 문학적 해설을 제공해주세요.

                    참조 원문:
                    ${relevantTexts.join('\n\n')}

                    지침:
                    - 답변은 반드시 한국어로 작성하세요
                    - 프랑스어는 포함하지 마세요
                    - 사용자의 배경지식이 소설 내용과 다르다면 부드럽게 수정해주세요
                    - 문학적 깊이와 철학적 의미를 강조해주세요`
            },
            {
                role: "user" as const,
                content: userMessage
            }
        ];

        try {
            const response = await openaiClient.chat.completions.create({
                model: chatModelId,
                messages: messages,
                max_tokens: 4096,
                temperature: 0.7,
                top_p: 0.9,
            });

            res.json({
                originalText: relevantTexts.map(text => ({ text })),
                response: {
                    output: {
                        message: {
                            content: [{
                                text: response.choices[0]?.message?.content || '응답을 생성할 수 없습니다.'
                            }]
                        }
                    }
                }
            });
        } catch (error) {
            console.error('OpenAI API Error:', error);
            res.status(500).json({
                error: 'OpenAI API 호출 중 오류가 발생했습니다.',
                details: error instanceof Error ? error.message : 'Unknown error'
            });
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
        const response = await openaiClient.embeddings.create({
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



