export interface Message {
    id: string;
    content: string;
    role: 'user' | 'assistant';
    timestamp: Date;
    originalText?: string[];
    ragModel?: RagModel;
    metadata?: any;
}

export type RagModel = 'naive' | 'advanced' | 'raptor' | 'rerank' | 'compressed' | 'hybrid' | 'rlvr';

export interface ChatResponse {
    originalText: Array<{ text: string }>;
    response: {
        output: {
            message: {
                content: Array<{ text: string }>;
            };
        };
    };
    metadata?: {
        expandedQueries?: string[];
        transformedQuery?: string;
        routingStrategy?: any;
        method?: string;
        hierarchicalLevels?: number;
        // Post-Retrieval 전략 메타데이터
        rerankedScores?: Array<{ score: number; preview: string }>;
        originalDocCount?: number;
        rerankedDocCount?: number;
        compressionRatio?: string;
        topRerankScores?: number[];
        // 원본 및 처리된 문서들
        originalDocuments?: Array<{ text: string; originalScore?: number }>;
        processedDocuments?: Array<{ text: string }>;
        compressedDocument?: { text: string };
        rerankedDocuments?: Array<{ text: string }>;
        // RLVR 관련 메타데이터
        verification?: {
            verifiedDocs: Array<{ text: string; credibility: number; relevance: number }>;
            verificationSummary: string;
        };
        reasoning?: {
            thinkingSteps: string[];
            logicalChain: string[];
            conclusion: string;
        };
        cotSteps?: string[];
    };
}
