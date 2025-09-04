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

    // Post-Retrieval 전략 API 엔드포인트들

    // Rerank RAG 엔드포인트 - 문서 재평가 및 재정렬
    app.post('/generate-rerank', async (req: express.Request<{}, {}, { userMessage: string }>, res: express.Response) => {
        const { userMessage } = req.body;

        try {
            // 1. 기본 벡터 검색 수행
            const embeddingMessage = await embeddingText(userMessage);
            const result = await vectorDbClient
                .namespace('france')
                .query({
                    topK: 6, // 더 많은 문서를 가져와서 rerank
                    vector: embeddingMessage
                });

            // 2. 검색 결과를 문서 형태로 변환
            const retrievedDocs = result.matches
                .map((match) => {
                    if (match.id && !isNaN(Number(match.id))) {
                        return {
                            text: chunkedText[Number(match.id)],
                            score: match.score || 0
                        };
                    }
                    return null;
                })
                .filter(doc => doc && doc.text.length > 0) as { text: string; score: number }[];

            // 3. Rerank로 문서들을 관련성 기준으로 재정렬
            const rerankedDocs = await rerankDocuments(userMessage, retrievedDocs);

            // 4. 상위 3개 문서만 사용
            const topRerankedTexts = rerankedDocs.slice(0, 3).map(doc => doc.text);

            // 5. 답변 생성
            const messages = [
                {
                    role: "system" as const,
                    content: `당신은 생텍쥐페리의 "어린왕자" 전문가입니다. Rerank를 통해 선별된 고품질 참조 원문을 바탕으로 답변해주세요.
                    
                    참조 원문 (관련성 순으로 정렬됨):
                    ${topRerankedTexts.join('\n\n')}
                    
                    지침:
                    - 답변은 반드시 한국어로 작성하세요
                    - 가장 관련성 높은 원문을 우선적으로 활용하세요
                    - 문학적 깊이와 철학적 의미를 강조해주세요`
                },
                {
                    role: "user" as const,
                    content: userMessage
                }
            ];

            const response = await openaiClient.chat.completions.create({
                model: chatModelId,
                messages: messages,
                max_tokens: 4096,
                temperature: 0.7,
            });

            res.json({
                originalText: topRerankedTexts.map(text => ({ text })),
                response: {
                    output: {
                        message: {
                            content: [{
                                text: response.choices[0]?.message?.content || '응답을 생성할 수 없습니다.'
                            }]
                        }
                    }
                },
                metadata: {
                    method: 'rerank',
                    rerankedScores: rerankedDocs.slice(0, 3).map(doc => ({
                        score: doc.rerankScore,
                        preview: doc.text.substring(0, 100) + '...'
                    })),
                    // 원본 문서들도 함께 전송
                    originalDocuments: retrievedDocs.map(doc => ({
                        text: doc.text,
                        originalScore: doc.score
                    })),
                    processedDocuments: topRerankedTexts.map(text => ({ text }))
                }
            });

        } catch (error) {
            console.error('Rerank RAG Error:', error);
            res.status(500).json({
                error: 'Rerank RAG 처리 중 오류가 발생했습니다.',
                details: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    });

    // Prompt Compression RAG 엔드포인트 - 정보 압축 및 요약
    app.post('/generate-compressed', async (req: express.Request<{}, {}, { userMessage: string }>, res: express.Response) => {
        const { userMessage } = req.body;

        try {
            // 1. 기본 벡터 검색 수행
            const embeddingMessage = await embeddingText(userMessage);
            const result = await vectorDbClient
                .namespace('france')
                .query({
                    topK: 5, // 압축을 위해 더 많은 문서 수집
                    vector: embeddingMessage
                });

            // 2. 검색 결과를 텍스트 배열로 변환
            const retrievedTexts = result.matches
                .map((match) => {
                    if (match.id && !isNaN(Number(match.id))) {
                        return chunkedText[Number(match.id)];
                    }
                    return '';
                })
                .filter(text => text.length > 0);

            // 3. Prompt Compression으로 정보 압축 및 요약
            const compressedContext = await compressAndMergeDocuments(userMessage, retrievedTexts);

            // 4. 압축된 컨텍스트로 답변 생성
            const messages = [
                {
                    role: "system" as const,
                    content: `당신은 생텍쥐페리의 "어린왕자" 전문가입니다. 압축되고 요약된 핵심 정보를 바탕으로 답변해주세요.
                    
                    압축된 참조 정보:
                    ${compressedContext}
                    
                    지침:
                    - 답변은 반드시 한국어로 작성하세요
                    - 압축된 정보의 모든 관련 내용을 활용하세요
                    - 문학적 깊이와 철학적 의미를 강조해주세요`
                },
                {
                    role: "user" as const,
                    content: userMessage
                }
            ];

            const response = await openaiClient.chat.completions.create({
                model: chatModelId,
                messages: messages,
                max_tokens: 4096,
                temperature: 0.7,
            });

            res.json({
                originalText: [{ text: compressedContext }],
                response: {
                    output: {
                        message: {
                            content: [{
                                text: response.choices[0]?.message?.content || '응답을 생성할 수 없습니다.'
                            }]
                        }
                    }
                },
                metadata: {
                    method: 'prompt_compression',
                    originalDocCount: retrievedTexts.length,
                    compressionRatio: `${retrievedTexts.join('').length} → ${compressedContext.length} chars`,
                    // 원본 문서들도 함께 전송
                    originalDocuments: retrievedTexts.map(text => ({ text })),
                    compressedDocument: { text: compressedContext }
                }
            });

        } catch (error) {
            console.error('Compression RAG Error:', error);
            res.status(500).json({
                error: 'Compression RAG 처리 중 오류가 발생했습니다.',
                details: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    });

    // Hybrid Post-Retrieval RAG 엔드포인트 - Rerank + Compression 조합
    app.post('/generate-hybrid', async (req: express.Request<{}, {}, { userMessage: string }>, res: express.Response) => {
        const { userMessage } = req.body;

        try {
            // 1. 기본 벡터 검색 수행 (더 많은 문서 수집)
            const embeddingMessage = await embeddingText(userMessage);
            const result = await vectorDbClient
                .namespace('france')
                .query({
                    topK: 8, // 하이브리드 방식을 위해 많은 문서 수집
                    vector: embeddingMessage
                });

            // 2. 검색 결과를 문서 형태로 변환
            const retrievedDocs = result.matches
                .map((match) => {
                    if (match.id && !isNaN(Number(match.id))) {
                        return {
                            text: chunkedText[Number(match.id)],
                            score: match.score || 0
                        };
                    }
                    return null;
                })
                .filter(doc => doc && doc.text.length > 0) as { text: string; score: number }[];

            // 3. Rerank로 문서들을 관련성 기준으로 재정렬
            const rerankedDocs = await rerankDocuments(userMessage, retrievedDocs);

            // 4. 상위 5개 문서 선별
            const topRerankedTexts = rerankedDocs.slice(0, 5).map(doc => doc.text);

            // 5. 선별된 문서들을 Compression으로 요약 및 병합
            const compressedContext = await compressAndMergeDocuments(userMessage, topRerankedTexts);

            // 6. 최종 답변 생성
            const messages = [
                {
                    role: "system" as const,
                    content: `당신은 생텍쥐페리의 "어린왕자" 전문가입니다. Rerank와 Compression을 모두 거친 최고 품질의 참조 정보를 바탕으로 답변해주세요.
                    
                    최적화된 참조 정보:
                    ${compressedContext}
                    
                    지침:
                    - 답변은 반드시 한국어로 작성하세요
                    - 관련성과 압축 최적화를 거친 고품질 정보를 모두 활용하세요
                    - 문학적 깊이와 철학적 의미를 강조해주세요
                    - 포괄적이면서도 정확한 답변을 제공하세요`
                },
                {
                    role: "user" as const,
                    content: userMessage
                }
            ];

            const response = await openaiClient.chat.completions.create({
                model: chatModelId,
                messages: messages,
                max_tokens: 4096,
                temperature: 0.7,
            });

            res.json({
                originalText: [{ text: compressedContext }],
                response: {
                    output: {
                        message: {
                            content: [{
                                text: response.choices[0]?.message?.content || '응답을 생성할 수 없습니다.'
                            }]
                        }
                    }
                },
                metadata: {
                    method: 'hybrid_rerank_compression',
                    originalDocCount: retrievedDocs.length,
                    rerankedDocCount: topRerankedTexts.length,
                    compressionRatio: `${topRerankedTexts.join('').length} → ${compressedContext.length} chars`,
                    topRerankScores: rerankedDocs.slice(0, 3).map(doc => doc.rerankScore),
                    // 원본 문서들과 중간 처리 결과들도 함께 전송
                    originalDocuments: retrievedDocs.map(doc => ({
                        text: doc.text,
                        originalScore: doc.score
                    })),
                    rerankedDocuments: topRerankedTexts.map(text => ({ text })),
                    compressedDocument: { text: compressedContext }
                }
            });

        } catch (error) {
            console.error('Hybrid RAG Error:', error);
            res.status(500).json({
                error: 'Hybrid RAG 처리 중 오류가 발생했습니다.',
                details: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    });

    // RLVR (Retrieval-based Language model for Verification and Reasoning) 엔드포인트
    app.post('/generate-rlvr', async (req: express.Request<{}, {}, { userMessage: string }>, res: express.Response) => {
        const { userMessage } = req.body;

        try {
            // 1. 기본 벡터 검색 수행
            const embeddingMessage = await embeddingText(userMessage);
            const result = await vectorDbClient
                .namespace('france')
                .query({
                    topK: 5,
                    vector: embeddingMessage
                });

            // 2. 검색 결과를 문서 형태로 변환
            const retrievedDocs = result.matches
                .map((match) => {
                    if (match.id && !isNaN(Number(match.id))) {
                        return {
                            text: chunkedText[Number(match.id)],
                            score: match.score || 0,
                            id: match.id
                        };
                    }
                    return null;
                })
                .filter(doc => doc && doc.text.length > 0) as { text: string; score: number; id: string }[];

            // 3. Verification - 문서 검증 과정
            const verificationResults = await performDocumentVerification(userMessage, retrievedDocs);

            // 4. Reasoning with CoT - 단계별 추론 과정
            const reasoningResult = await performCoTReasoning(userMessage, verificationResults.verifiedDocs);

            // 5. 최종 답변 생성
            const finalAnswer = await generateRLVRResponse(userMessage, reasoningResult);

            res.json({
                originalText: retrievedDocs.map(doc => ({ text: doc.text })),
                response: {
                    output: {
                        message: {
                            content: [{
                                text: finalAnswer.answer
                            }]
                        }
                    }
                },
                metadata: {
                    method: 'rlvr',
                    verification: verificationResults,
                    reasoning: reasoningResult,
                    cotSteps: finalAnswer.cotSteps,
                    originalDocuments: retrievedDocs.map(doc => ({
                        text: doc.text,
                        originalScore: doc.score,
                        id: doc.id
                    }))
                }
            });

        } catch (error) {
            console.error('RLVR RAG Error:', error);
            res.status(500).json({
                error: 'RLVR RAG 처리 중 오류가 발생했습니다.',
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

    // === Post-Retrieval 전략 함수들 ===

    // 1. Rerank - 가져온 문서들을 쿼리와의 관련성 기준으로 재평가 및 재정렬
    async function rerankDocuments(
        query: string,
        documents: { text: string; score?: number }[]
    ): Promise<{ text: string; rerankScore: number }[]> {
        // 각 문서에 대해 쿼리와의 관련성을 LLM으로 평가
        const rerankPromises = documents.map(async (doc, index) => {
            const rerankPrompt = `다음 문서가 주어진 질문과 얼마나 관련성이 있는지 1-10 점수로 평가해주세요.

                        질문: "${query}"

                        문서:
                        ${doc.text}

                        평가 기준:
                        - 질문의 핵심 키워드가 문서에 포함되어 있는가?
                        - 문서의 내용이 질문에 직접적으로 답할 수 있는가?
                        - 문서의 맥락이 질문의 의도와 일치하는가?

                        응답 형식: 점수만 숫자로 (예: 8)`;

            try {
                const response = await openaiClient.chat.completions.create({
                    model: chatModelId,
                    messages: [{ role: "user", content: rerankPrompt }],
                    max_tokens: 10,
                    temperature: 0.1,
                });

                const scoreText = response.choices[0]?.message?.content?.trim() || '5';
                const score = parseInt(scoreText) || 5;

                return {
                    text: doc.text,
                    rerankScore: Math.min(Math.max(score, 1), 10) // 1-10 범위 보장
                };
            } catch (error) {
                console.error(`Rerank error for document ${index}:`, error);
                return {
                    text: doc.text,
                    rerankScore: 5 // 기본값
                };
            }
        });

        const rerankedDocs = await Promise.all(rerankPromises);

        // 점수 기준으로 내림차순 정렬
        return rerankedDocs.sort((a, b) => b.rerankScore - a.rerankScore);
    }

    // 2. Prompt Compression - 쿼리 중심으로 문서 요약 및 병합
    async function compressAndMergeDocuments(
        query: string,
        documents: string[]
    ): Promise<string> {
        if (documents.length === 0) return '';

        // 문서가 너무 많으면 상위 5개만 사용
        const docsToCompress = documents.slice(0, 5);

        const compressionPrompt = `다음은 사용자 질문과 관련된 "어린왕자" 원문들입니다. 
질문에 답하는데 필요한 핵심 정보만 추출하여 간결하게 요약해주세요.

사용자 질문: "${query}"

원문 문서들:
${docsToCompress.map((doc, index) => `[문서 ${index + 1}]
${doc}`).join('\n\n')}

작업 지침:
1. 질문과 직접 관련된 내용만 추출
2. 중복되는 정보는 통합
3. 원문의 의미를 보존하면서 간결하게 요약
4. 불필요한 세부사항은 제거
5. 최종 요약본은 질문에 답하기에 충분한 정보를 포함해야 함

압축된 요약:`;

        try {
            const response = await openaiClient.chat.completions.create({
                model: chatModelId,
                messages: [{ role: "user", content: compressionPrompt }],
                max_tokens: 1500,
                temperature: 0.3,
            });

            return response.choices[0]?.message?.content?.trim() || docsToCompress.join('\n\n');
        } catch (error) {
            console.error('Compression error:', error);
            return docsToCompress.join('\n\n'); // 압축 실패시 원본 반환
        }
    }

    // === RLVR (Verification & Reasoning) 함수들 ===

    // 1. Document Verification - 문서 검증 과정
    async function performDocumentVerification(
        query: string,
        documents: { text: string; score: number; id: string }[]
    ): Promise<{
        verifiedDocs: { text: string; score: number; id: string; credibility: number; relevance: number }[];
        verificationSummary: string;
    }> {
        const verificationPrompt = `다음은 사용자 질문과 검색된 "어린왕자" 문서들입니다. 각 문서를 검증해주세요.

사용자 질문: "${query}"

검증할 문서들:
${documents.map((doc, index) => `[문서 ${index + 1}]
${doc.text}`).join('\n\n')}

각 문서에 대해 다음을 평가해주세요:
1. 신뢰성(Credibility): 원문의 정확성과 완전성 (1-10점)
2. 관련성(Relevance): 질문과의 직접적 연관성 (1-10점)

응답 형식:
문서 1: 신뢰성=8, 관련성=9
문서 2: 신뢰성=7, 관련성=6
...

검증 요약: [전체적인 문서 품질과 신뢰성에 대한 간단한 평가]`;

        try {
            const response = await openaiClient.chat.completions.create({
                model: chatModelId,
                messages: [{ role: "user", content: verificationPrompt }],
                max_tokens: 1000,
                temperature: 0.1,
            });

            const verificationText = response.choices[0]?.message?.content || '';

            // 검증 결과 파싱
            const verifiedDocs = documents.map((doc, index) => {
                const docPattern = new RegExp(`문서 ${index + 1}[:\\s]*신뢰성\\s*=\\s*(\\d+)[,\\s]*관련성\\s*=\\s*(\\d+)`, 'i');
                const match = verificationText.match(docPattern);

                return {
                    ...doc,
                    credibility: match ? parseInt(match[1]) : 7, // 기본값 7
                    relevance: match ? parseInt(match[2]) : 7    // 기본값 7
                };
            });

            // 검증 요약 추출
            const summaryMatch = verificationText.match(/검증 요약[:\\s]*(.+)$/im);
            const verificationSummary = summaryMatch ? summaryMatch[1].trim() : '문서 검증이 완료되었습니다.';

            // 신뢰성과 관련성이 모두 6 이상인 문서만 필터링
            const filteredDocs = verifiedDocs.filter(doc => doc.credibility >= 6 && doc.relevance >= 6);

            return {
                verifiedDocs: filteredDocs.length > 0 ? filteredDocs : verifiedDocs.slice(0, 3), // 최소 3개는 보장
                verificationSummary
            };
        } catch (error) {
            console.error('Verification error:', error);
            return {
                verifiedDocs: documents.map(doc => ({ ...doc, credibility: 7, relevance: 7 })),
                verificationSummary: '검증 과정에서 오류가 발생했지만 기본 검증을 적용했습니다.'
            };
        }
    }

    // 2. Chain of Thought Reasoning - 단계별 추론 과정
    async function performCoTReasoning(
        query: string,
        verifiedDocs: { text: string; credibility: number; relevance: number }[]
    ): Promise<{
        thinkingSteps: string[];
        logicalChain: string[];
        conclusion: string;
    }> {
        const cotPrompt = `당신은 "어린왕자" 전문가입니다. 다음 질문에 대해 단계별로 사고하며 답변해주세요.

질문: "${query}"

검증된 참조 문서들:
${verifiedDocs.map((doc, index) => `[문서 ${index + 1}] (신뢰성: ${doc.credibility}/10, 관련성: ${doc.relevance}/10)
${doc.text}`).join('\n\n')}

<thinking>
단계별 사고 과정을 여기에 작성해주세요:
1. 질문 분석: [질문의 핵심 요소 파악]
2. 문서 검토: [각 문서에서 관련 정보 추출]
3. 논리적 연결: [정보들 간의 관계 분석]
4. 가설 검증: [가능한 답변들 검토]
5. 최종 판단: [결론 도출 과정]
</thinking>

위의 사고 과정을 바탕으로 논리적 추론 체인을 구성해주세요:
논리 체인:
1. [첫 번째 논리적 단계]
2. [두 번째 논리적 단계]
3. [세 번째 논리적 단계]
...

결론: [최종 결론]`;

        try {
            const response = await openaiClient.chat.completions.create({
                model: chatModelId,
                messages: [{ role: "user", content: cotPrompt }],
                max_tokens: 2000,
                temperature: 0.3,
            });

            const reasoningText = response.choices[0]?.message?.content || '';

            // <thinking> 태그 내용 추출
            const thinkingMatch = reasoningText.match(/<thinking>([\s\S]*?)<\/thinking>/i);
            const thinkingContent = thinkingMatch ? thinkingMatch[1].trim() : '';

            // 사고 과정을 단계별로 분리
            const thinkingSteps = thinkingContent
                .split(/\d+\.\s/)
                .filter(step => step.trim().length > 0)
                .map(step => step.trim());

            // 논리 체인 추출
            const logicalChainMatch = reasoningText.match(/논리 체인[:\\s]*([\s\S]*?)(?=결론|$)/i);
            const logicalChainContent = logicalChainMatch ? logicalChainMatch[1].trim() : '';

            const logicalChain = logicalChainContent
                .split(/\d+\.\s/)
                .filter(step => step.trim().length > 0)
                .map(step => step.trim());

            // 결론 추출
            const conclusionMatch = reasoningText.match(/결론[:\\s]*(.+)$/im);
            const conclusion = conclusionMatch ? conclusionMatch[1].trim() : '추론 과정을 통해 결론에 도달했습니다.';

            return {
                thinkingSteps: thinkingSteps.length > 0 ? thinkingSteps : ['질문을 분석하고 있습니다.'],
                logicalChain: logicalChain.length > 0 ? logicalChain : ['문서를 바탕으로 논리적 추론을 진행합니다.'],
                conclusion
            };
        } catch (error) {
            console.error('CoT Reasoning error:', error);
            return {
                thinkingSteps: ['질문 분석', '문서 검토', '논리적 추론'],
                logicalChain: ['검증된 문서를 바탕으로 추론을 진행합니다.'],
                conclusion: '문서를 바탕으로 결론을 도출했습니다.'
            };
        }
    }

    // 3. RLVR 최종 답변 생성
    async function generateRLVRResponse(
        query: string,
        reasoningResult: {
            thinkingSteps: string[];
            logicalChain: string[];
            conclusion: string;
        }
    ): Promise<{
        answer: string;
        cotSteps: string[];
    }> {
        const finalPrompt = `당신은 "어린왕자" 전문가입니다. 검증과 추론 과정을 거친 결과를 바탕으로 최종 답변을 생성해주세요.

질문: "${query}"

추론 과정:
${reasoningResult.logicalChain.map((step, index) => `${index + 1}. ${step}`).join('\n')}

결론: ${reasoningResult.conclusion}

위의 추론 과정을 바탕으로 사용자에게 제공할 최종 답변을 작성해주세요:
- 추론 과정의 핵심 포인트들을 포함
- 문학적 깊이와 철학적 의미 강조
- 한국어로 작성
- 명확하고 설득력 있는 답변`;

        try {
            const response = await openaiClient.chat.completions.create({
                model: chatModelId,
                messages: [{ role: "user", content: finalPrompt }],
                max_tokens: 1500,
                temperature: 0.7,
            });

            const finalAnswer = response.choices[0]?.message?.content || '추론 과정을 통해 답변을 생성했습니다.';

            return {
                answer: finalAnswer,
                cotSteps: [
                    ...reasoningResult.thinkingSteps,
                    ...reasoningResult.logicalChain,
                    `결론: ${reasoningResult.conclusion}`
                ]
            };
        } catch (error) {
            console.error('Final answer generation error:', error);
            return {
                answer: '검증과 추론 과정을 통해 답변을 준비했지만, 최종 생성 중 오류가 발생했습니다.',
                cotSteps: reasoningResult.logicalChain
            };
        }
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



