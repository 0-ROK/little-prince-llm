'use client';

import { useState, useRef, useEffect } from 'react';
import { Message, ChatResponse } from '@/types/chat';

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      content: '안녕하세요! 어린왕자에 대해 궁금한 것이 있으시면 무엇이든 물어보세요. 생텍쥐페리의 원문을 바탕으로 깊이 있는 문학적 해설을 제공해드리겠습니다. ⭐',
      role: 'assistant',
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      content: input,
      role: 'user',
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('http://localhost:8080/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userMessage: input }),
      });

      if (!response.ok) {
        throw new Error('API 요청에 실패했습니다.');
      }

      const data: ChatResponse = await response.json();
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: data.response.output.message.content[0]?.text || '응답을 생성할 수 없습니다.',
        role: 'assistant',
        timestamp: new Date(),
        originalText: data.originalText.map(item => item.text),
      };

      setMessages(prev => [...prev, aiMessage]);
    } catch (error) {
      console.error('Error:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: '죄송합니다. 서버와의 연결에 문제가 발생했습니다. 잠시 후 다시 시도해주세요.',
        role: 'assistant',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      {/* Header */}
      <header className="border-b border-indigo-100 bg-white/80 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold text-indigo-900 flex items-center gap-2">
            ⭐ 어린왕자와의 대화
            <span className="text-sm font-normal text-indigo-600">Little Prince Literary Assistant</span>
          </h1>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-4xl mx-auto space-y-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-3xl rounded-2xl px-4 py-3 ${message.role === 'user'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white border border-indigo-100 text-gray-800 shadow-sm'
                  }`}
              >
                <div className="whitespace-pre-wrap">{message.content}</div>
                {message.originalText && message.originalText.length > 0 && (
                  <details className="mt-3 text-sm">
                    <summary className="cursor-pointer text-indigo-600 hover:text-indigo-800">
                      📖 참조된 원문 보기
                    </summary>
                    <div className="mt-2 p-3 bg-indigo-50 rounded-lg border-l-4 border-indigo-300">
                      {message.originalText.map((text, index) => (
                        <div key={index} className="mb-2 last:mb-0 text-indigo-800">
                          <div className="text-xs text-indigo-500 mb-1">원문 {index + 1}:</div>
                          <div className="italic">{text}</div>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
                <div className="text-xs mt-2 opacity-60">
                  {message.timestamp.toLocaleTimeString()}
                </div>
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-white border border-indigo-100 text-gray-800 shadow-sm rounded-2xl px-4 py-3 max-w-3xl">
                <div className="flex items-center space-x-2">
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                    <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                  </div>
                  <span className="text-indigo-600">어린왕자가 생각하고 있어요...</span>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="border-t border-indigo-100 bg-white/80 text-black backdrop-blur-sm p-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex space-x-4">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="어린왕자에 대해 궁금한 것을 물어보세요... (Enter로 전송, Shift+Enter로 줄바꿈)"
              className="flex-1 resize-none border border-indigo-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent max-h-32"
              rows={1}
              disabled={isLoading}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || isLoading}
              className="px-6 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center space-x-2"
            >
              <span>전송</span>
              <span>✨</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
