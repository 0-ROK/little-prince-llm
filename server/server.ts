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

    // Advanced RAG 엔드포인트
    app.post('/generate-advanced', async (req: express.Request<{}, {}, { userMessage: string }>, res: express.Response) => {
        const { userMessage } = req.body;

        try {
            // 1. Query Expansion - 쿼리를 세부적으로 확장
            const expandedQueries = await expandQuery(userMessage);

            // 2. Query Transformation - 검색 최적화된 형태로 변환
            const transformedQuery = await transformQuery(userMessage);

            // 3. Query Routing - 쿼리 유형에 따른 검색 전략 결정
            const routingStrategy = await routeQuery(userMessage);

            // 4. 다중 쿼리로 벡터 검색 수행
            const allRelevantTexts = await performAdvancedSearch(
                expandedQueries,
                transformedQuery,
                routingStrategy
            );

            // 5. 컨텍스트 융합 및 답변 생성
            const response = await generateAdvancedResponse(userMessage, allRelevantTexts, routingStrategy);

            res.json({
                originalText: allRelevantTexts.map(text => ({ text })),
                response: {
                    output: {
                        message: {
                            content: [{
                                text: response
                            }]
                        }
                    }
                },
                metadata: {
                    expandedQueries,
                    transformedQuery,
                    routingStrategy
                }
            });

        } catch (error) {
            console.error('Advanced RAG Error:', error);
            res.status(500).json({
                error: 'Advanced RAG 처리 중 오류가 발생했습니다.',
                details: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    });

    // Raptor RAG 엔드포인트
    // app.post('/generate-raptor', async (req: express.Request<{}, {}, { userMessage: string }>, res: express.Response) => {
    //     const { userMessage } = req.body;

    //     try {
    //         // Raptor RAG: 계층적 클러스터링 기반 검색
    //         const hierarchicalResults = await performRaptorSearch(userMessage);
    //         const response = await generateRaptorResponse(userMessage, hierarchicalResults);

    //         res.json({
    //             originalText: hierarchicalResults.map(text => ({ text })),
    //             response: {
    //                 output: {
    //                     message: {
    //                         content: [{
    //                             text: response
    //                         }]
    //                     }
    //                 }
    //             },
    //             metadata: {
    //                 method: 'raptor',
    //                 hierarchicalLevels: hierarchicalResults.length
    //             }
    //         });

    //     } catch (error) {
    //         console.error('Raptor RAG Error:', error);
    //         res.status(500).json({
    //             error: 'Raptor RAG 처리 중 오류가 발생했습니다.',
    //             details: error instanceof Error ? error.message : 'Unknown error'
    //         });
    //     }
    // });


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

    // === Advanced RAG 핵심 함수들 ===

    // 1. Query Expansion - 쿼리를 세부적으로 확장
    async function expandQuery(originalQuery: string): Promise<string[]> {
        const expansionPrompt = `다음 질문을 어린왕자 소설 검색에 최적화하여 3-5개의 관련 질문으로 확장해주세요. 
        원래 질문: "${originalQuery}"
        
        확장된 질문들 (각 줄에 하나씩):`;

        const response = await openaiClient.chat.completions.create({
            model: chatModelId,
            messages: [{ role: "user", content: expansionPrompt }],
            max_tokens: 500,
            temperature: 0.7,
        });

        const expandedText = response.choices[0]?.message?.content || '';
        return expandedText.split('\n').filter(line => line.trim().length > 0).slice(0, 5);
    }

    // 2. Query Transformation - 검색 최적화된 형태로 변환
    async function transformQuery(originalQuery: string): Promise<string> {
        const transformPrompt = `다음 질문을 벡터 검색에 최적화된 키워드 중심의 검색 쿼리로 변환해주세요.
        원래 질문: "${originalQuery}"
        
        변환된 검색 쿼리 (핵심 키워드와 개념 중심):`;

        const response = await openaiClient.chat.completions.create({
            model: chatModelId,
            messages: [{ role: "user", content: transformPrompt }],
            max_tokens: 200,
            temperature: 0.3,
        });

        return response.choices[0]?.message?.content?.trim() || originalQuery;
    }

    // 3. Query Routing - 쿼리 유형에 따른 검색 전략 결정
    async function routeQuery(originalQuery: string): Promise<{
        category: string;
        searchStrategy: string;
        topK: number;
        weights: { semantic: number; keyword: number };
    }> {
        const routingPrompt = `다음 질문을 분석하여 카테고리를 분류해주세요:
        질문: "${originalQuery}"
        
        다음 중 하나로 분류하세요:
        1. character - 등장인물에 관한 질문
        2. plot - 줄거리나 사건에 관한 질문  
        3. philosophy - 철학적 의미나 교훈에 관한 질문
        4. symbolism - 상징이나 은유에 관한 질문
        5. general - 일반적인 질문
        
        응답 형식: category_name`;

        const response = await openaiClient.chat.completions.create({
            model: chatModelId,
            messages: [{ role: "user", content: routingPrompt }],
            max_tokens: 50,
            temperature: 0.1,
        });

        const category = response.choices[0]?.message?.content?.trim().toLowerCase() || 'general';

        // 카테고리별 검색 전략 설정
        // (예시. sementic과 keyword는 실제로 사용하지 않고 있음.)
        const strategies = {
            character: { searchStrategy: 'character_focused', topK: 4, weights: { semantic: 0.7, keyword: 0.3 } },
            plot: { searchStrategy: 'sequential_context', topK: 5, weights: { semantic: 0.6, keyword: 0.4 } },
            philosophy: { searchStrategy: 'thematic_search', topK: 3, weights: { semantic: 0.8, keyword: 0.2 } },
            symbolism: { searchStrategy: 'symbolic_analysis', topK: 4, weights: { semantic: 0.9, keyword: 0.1 } },
            general: { searchStrategy: 'balanced_search', topK: 3, weights: { semantic: 0.6, keyword: 0.4 } }
        };

        return {
            category,
            ...strategies[category as keyof typeof strategies] || strategies.general
        };
    }

    // 4. 다중 쿼리로 벡터 검색 수행
    async function performAdvancedSearch(
        expandedQueries: string[],
        transformedQuery: string,
        routingStrategy: {
            topK: number;
        }
    ): Promise<string[]> {
        const allResults = new Set<string>();

        // 원본 + 변환된 쿼리 검색
        const queries = [transformedQuery, ...expandedQueries];

        for (const query of queries) {
            const embeddingVector = await embeddingText(query);
            const result = await vectorDbClient
                .namespace('france')
                .query({
                    topK: routingStrategy.topK,
                    // 만약 문서 양이 많다면, 여러 카테고리로 나눠서 벡터 db를 구성하는 전략도 고려할 수 있다!
                    vector: embeddingVector
                });

            result.matches.forEach(match => {
                if (match.id && !isNaN(Number(match.id))) {
                    const text = chunkedText[Number(match.id)];
                    if (text && text.length > 0) {
                        allResults.add(text);
                    }
                }
            });
        }

        return Array.from(allResults).slice(0, routingStrategy.topK * 2); // 중복 제거 후 최대값 제한
    }

    // 5. 컨텍스트 융합 및 답변 생성
    async function generateAdvancedResponse(
        originalQuery: string,
        relevantTexts: string[],
        routingStrategy: any
    ): Promise<string> {
        const contextualPrompt = `당신은 생텍쥐페리의 "어린왕자" 전문가입니다. 
        
        질문 카테고리: ${routingStrategy.category}
        검색 전략: ${routingStrategy.searchStrategy}
        
        다음 프랑스어 원문들을 참고하여 사용자의 질문에 ${routingStrategy.category} 관점에서 깊이 있게 답변해주세요:
        
        참조 원문:
        ${relevantTexts.join('\n\n')}
        
        질문: "${originalQuery}"
        
        지침:
        - 답변은 반드시 한국어로 작성하세요
        - ${routingStrategy.category} 카테고리에 특화된 관점으로 답변하세요
        - 여러 원문의 내용을 종합하여 포괄적인 답변을 제공하세요
        - 문학적 깊이와 철학적 의미를 강조해주세요`;

        const response = await openaiClient.chat.completions.create({
            model: chatModelId,
            messages: [{ role: "user", content: contextualPrompt }],
            max_tokens: 4096,
            temperature: 0.7,
        });

        return response.choices[0]?.message?.content || '응답을 생성할 수 없습니다.';
    }

    // === Raptor RAG 함수들 ===

    // 6. Raptor 계층적 검색
    async function performRaptorSearch(userMessage: string): Promise<string[]> {
        // 간단한 Raptor 구현: 다양한 granularity에서 검색
        const embeddingVector = await embeddingText(userMessage);

        // 여러 topK 값으로 계층적 검색
        const hierarchicalResults: string[] = [];
        const topKValues = [2, 4, 6]; // 다른 granularity

        for (const topK of topKValues) {
            const result = await vectorDbClient
                .namespace('france')
                .query({
                    topK,
                    vector: embeddingVector
                });

            const texts = result.matches
                .map(match => {
                    if (match.id && !isNaN(Number(match.id))) {
                        return chunkedText[Number(match.id)];
                    }
                    return '';
                })
                .filter(text => text.length > 0);

            hierarchicalResults.push(...texts);
        }

        // 중복 제거 및 relevance 기반 정렬
        const uniqueTexts = Array.from(new Set(hierarchicalResults));
        return uniqueTexts.slice(0, 8); // 최대 8개 컨텍스트
    }

    // 7. Raptor 응답 생성
    // async function generateRaptorResponse(originalQuery: string, hierarchicalTexts: string[]): Promise<string> {
    //     const raptorPrompt = `당신은 생텍쥐페리의 "어린왕자" 전문가입니다. 

    //     계층적 검색을 통해 수집된 다음 프랑스어 원문들을 참고하여 사용자의 질문에 답변해주세요:

    //     참조 원문 (계층적 컨텍스트):
    //     ${hierarchicalTexts.map((text, index) => `[레벨 ${Math.floor(index / 2) + 1}] ${text}`).join('\n\n')}

    //     질문: "${originalQuery}"

    //     지침:
    //     - 답변은 반드시 한국어로 작성하세요
    //     - 계층적 컨텍스트를 활용하여 다각도로 분석해주세요
    //     - 광범위한 맥락에서 세부적인 내용까지 아우르는 답변을 제공하세요
    //     - 문학적 깊이와 철학적 의미를 강조해주세요`;

    //     const response = await openaiClient.chat.completions.create({
    //         model: chatModelId,
    //         messages: [{ role: "user", content: raptorPrompt }],
    //         max_tokens: 4096,
    //         temperature: 0.7,
    //     });

    //     return response.choices[0]?.message?.content || '응답을 생성할 수 없습니다.';
    // }


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



