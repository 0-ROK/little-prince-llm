export interface Message {
    id: string;
    content: string;
    role: 'user' | 'assistant';
    timestamp: Date;
    originalText?: string[];
    ragModel?: RagModel;
    metadata?: any;
}

export type RagModel = 'naive' | 'advanced' | 'raptor';

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
    };
}
