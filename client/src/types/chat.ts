export interface Message {
    id: string;
    content: string;
    role: 'user' | 'assistant';
    timestamp: Date;
    originalText?: string[];
}

export interface ChatResponse {
    originalText: Array<{ text: string }>;
    response: {
        output: {
            message: {
                content: Array<{ text: string }>;
            };
        };
    };
}
