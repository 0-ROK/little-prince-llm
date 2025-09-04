'use client';

import { useState, useRef, useEffect } from 'react';
import { Message, ChatResponse, RagModel } from '@/types/chat';

export default function Home() {
  const [mounted, setMounted] = useState(false);
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
  const [selectedRagModel, setSelectedRagModel] = useState<RagModel>('naive');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

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
      ragModel: selectedRagModel,
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      // RAG 모델에 따른 엔드포인트 선택
      const endpoints = {
        naive: '/generate',
        advanced: '/generate-advanced',
        raptor: '/generate-raptor',
        rerank: '/generate-rerank',
        compressed: '/generate-compressed',
        hybrid: '/generate-hybrid',
        rlvr: '/generate-rlvr'
      };

      const response = await fetch(`http://localhost:8080${endpoints[selectedRagModel]}`, {
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
        ragModel: selectedRagModel,
        metadata: data.metadata,
      };

      setMessages(prev => [...prev, aiMessage]);
    } catch (error) {
      console.error('Error:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: '죄송합니다. 서버와의 연결에 문제가 발생했습니다. 잠시 후 다시 시도해주세요.',
        role: 'assistant',
        timestamp: new Date(),
        ragModel: selectedRagModel,
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
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-indigo-900 flex items-center gap-2">
                ⭐ 어린왕자와의 대화
                <span className="text-sm font-normal text-indigo-600">Little Prince Literary Assistant</span>
              </h1>
            </div>

            {/* RAG 모델 선택 */}
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-indigo-700">RAG 모델:</label>
              <select
                value={selectedRagModel}
                onChange={(e) => setSelectedRagModel(e.target.value as RagModel)}
                className="px-3 py-1.5 text-sm border border-indigo-200 rounded-lg bg-white text-black focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              >
                <option value="naive">Naive RAG (기본)</option>
                <option value="advanced">Advanced RAG (고급)</option>
                <option value="raptor">Raptor RAG (계층적)</option>
                <option value="rerank">Rerank RAG (재평가)</option>
                <option value="compressed">Compressed RAG (압축)</option>
                <option value="hybrid">Hybrid RAG (혼합)</option>
                <option value="rlvr">RLVR RAG (검증&추론)</option>
              </select>
            </div>
          </div>

          <div className="mt-2 text-sm text-amber-600 bg-amber-50 px-3 py-2 rounded-lg border border-amber-200">
            💡 <strong>안내:</strong> 각 질문은 독립적으로 처리되며, 이전 대화 내용을 기억하지 않습니다.
          </div>
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

                {/* RAG 모델 정보 표시 */}
                {message.role === 'user' && message.ragModel && (
                  <div className="mt-2 text-xs bg-indigo-500 px-2 py-1 rounded inline-block">
                    {message.ragModel === 'naive' && '🔍 Naive RAG'}
                    {message.ragModel === 'advanced' && '🚀 Advanced RAG'}
                    {message.ragModel === 'raptor' && '🌳 Raptor RAG'}
                    {message.ragModel === 'rerank' && '⚡ Rerank RAG'}
                    {message.ragModel === 'compressed' && '🗜️ Compressed RAG'}
                    {message.ragModel === 'hybrid' && '🔥 Hybrid RAG'}
                    {message.ragModel === 'rlvr' && '🧠 RLVR RAG'}
                  </div>
                )}

                {/* Advanced RAG 메타데이터 표시 */}
                {message.role === 'assistant' && message.ragModel === 'advanced' && message.metadata && (
                  <details className="mt-3 text-sm">
                    <summary className="cursor-pointer text-purple-600 hover:text-purple-800">
                      🚀 Advanced RAG 처리 정보
                    </summary>
                    <div className="mt-2 p-3 bg-purple-50 rounded-lg border-l-4 border-purple-300">
                      {message.metadata.routingStrategy && (
                        <div className="mb-2">
                          <span className="font-semibold text-purple-700">카테고리:</span> {message.metadata.routingStrategy.category}
                        </div>
                      )}
                      {message.metadata.transformedQuery && (
                        <div className="mb-2">
                          <span className="font-semibold text-purple-700">변환된 쿼리:</span> {message.metadata.transformedQuery}
                        </div>
                      )}
                      {message.metadata.expandedQueries && message.metadata.expandedQueries.length > 0 && (
                        <div>
                          <span className="font-semibold text-purple-700">확장된 쿼리들:</span>
                          <ul className="list-disc ml-4 mt-1">
                            {message.metadata.expandedQueries.map((query: string, index: number) => (
                              <li key={index} className="text-purple-600">{query}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </details>
                )}

                {/* Raptor RAG 메타데이터 표시 */}
                {message.role === 'assistant' && message.ragModel === 'raptor' && message.metadata && (
                  <details className="mt-3 text-sm">
                    <summary className="cursor-pointer text-green-600 hover:text-green-800">
                      🌳 Raptor RAG 처리 정보
                    </summary>
                    <div className="mt-2 p-3 bg-green-50 rounded-lg border-l-4 border-green-300">
                      <div className="text-green-700">
                        <span className="font-semibold">계층적 검색 레벨:</span> {message.metadata.hierarchicalLevels || 'N/A'}개 컨텍스트
                      </div>
                    </div>
                  </details>
                )}

                {/* Rerank RAG 메타데이터 표시 */}
                {message.role === 'assistant' && message.ragModel === 'rerank' && message.metadata && (
                  <details className="mt-3 text-sm">
                    <summary className="cursor-pointer text-yellow-600 hover:text-yellow-800">
                      ⚡ Rerank RAG 처리 정보
                    </summary>
                    <div className="mt-2 p-3 bg-yellow-50 rounded-lg border-l-4 border-yellow-300 space-y-3">
                      {message.metadata.rerankedScores && message.metadata.rerankedScores.length > 0 && (
                        <div className="text-yellow-700">
                          <span className="font-semibold">재평가된 문서들:</span>
                          <ul className="list-disc ml-4 mt-1">
                            {message.metadata.rerankedScores.map((item: any, index: number) => (
                              <li key={index} className="mb-1">
                                <span className="text-yellow-600">점수: {item.score}/10</span> - {item.preview}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* 원본 문서들 표시 */}
                      {message.metadata.originalDocuments && message.metadata.originalDocuments.length > 0 && (
                        <details className="border-t border-yellow-200 pt-2">
                          <summary className="cursor-pointer text-yellow-600 font-medium">
                            📄 원본 문서들 ({message.metadata.originalDocuments.length}개)
                          </summary>
                          <div className="mt-2 space-y-2">
                            {message.metadata.originalDocuments.map((doc: any, index: number) => (
                              <div key={index} className="p-2 bg-yellow-100 rounded text-xs text-yellow-800">
                                <div className="font-medium mb-1">
                                  원본 {index + 1} (유사도: {doc.originalScore?.toFixed(3) || 'N/A'})
                                </div>
                                <div className="italic">{doc.text.substring(0, 200)}...</div>
                              </div>
                            ))}
                          </div>
                        </details>
                      )}

                      {/* 처리된 문서들 표시 */}
                      {message.metadata.processedDocuments && message.metadata.processedDocuments.length > 0 && (
                        <details className="border-t border-yellow-200 pt-2">
                          <summary className="cursor-pointer text-yellow-600 font-medium">
                            ✨ 재평가 후 선별된 문서들 ({message.metadata.processedDocuments.length}개)
                          </summary>
                          <div className="mt-2 space-y-2">
                            {message.metadata.processedDocuments.map((doc: any, index: number) => (
                              <div key={index} className="p-2 bg-yellow-200 rounded text-xs text-yellow-800">
                                <div className="font-medium mb-1">선별 문서 {index + 1}</div>
                                <div className="italic">{doc.text.substring(0, 200)}...</div>
                              </div>
                            ))}
                          </div>
                        </details>
                      )}
                    </div>
                  </details>
                )}

                {/* Compressed RAG 메타데이터 표시 */}
                {message.role === 'assistant' && message.ragModel === 'compressed' && message.metadata && (
                  <details className="mt-3 text-sm">
                    <summary className="cursor-pointer text-orange-600 hover:text-orange-800">
                      🗜️ Compressed RAG 처리 정보
                    </summary>
                    <div className="mt-2 p-3 bg-orange-50 rounded-lg border-l-4 border-orange-300 space-y-3">
                      <div className="text-orange-700 space-y-1">
                        {message.metadata.originalDocCount && (
                          <div>
                            <span className="font-semibold">원본 문서 수:</span> {message.metadata.originalDocCount}개
                          </div>
                        )}
                        {message.metadata.compressionRatio && (
                          <div>
                            <span className="font-semibold">압축 비율:</span> {message.metadata.compressionRatio}
                          </div>
                        )}
                      </div>

                      {/* 원본 문서들 표시 */}
                      {message.metadata.originalDocuments && message.metadata.originalDocuments.length > 0 && (
                        <details className="border-t border-orange-200 pt-2">
                          <summary className="cursor-pointer text-orange-600 font-medium">
                            📄 원본 문서들 ({message.metadata.originalDocuments.length}개)
                          </summary>
                          <div className="mt-2 space-y-2">
                            {message.metadata.originalDocuments.map((doc: any, index: number) => (
                              <div key={index} className="p-2 bg-orange-100 rounded text-xs text-orange-800">
                                <div className="font-medium mb-1">원본 {index + 1}</div>
                                <div className="italic">{doc.text.substring(0, 200)}...</div>
                              </div>
                            ))}
                          </div>
                        </details>
                      )}

                      {/* 압축된 문서 표시 */}
                      {message.metadata.compressedDocument && (
                        <details className="border-t border-orange-200 pt-2">
                          <summary className="cursor-pointer text-orange-600 font-medium">
                            🗜️ 압축된 문서
                          </summary>
                          <div className="mt-2">
                            <div className="p-2 bg-orange-200 rounded text-xs text-orange-800">
                              <div className="font-medium mb-1">압축 결과</div>
                              <div className="italic">{message.metadata.compressedDocument.text.substring(0, 500)}...</div>
                            </div>
                          </div>
                        </details>
                      )}
                    </div>
                  </details>
                )}

                {/* Hybrid RAG 메타데이터 표시 */}
                {message.role === 'assistant' && message.ragModel === 'hybrid' && message.metadata && (
                  <details className="mt-3 text-sm">
                    <summary className="cursor-pointer text-red-600 hover:text-red-800">
                      🔥 Hybrid RAG 처리 정보
                    </summary>
                    <div className="mt-2 p-3 bg-red-50 rounded-lg border-l-4 border-red-300 space-y-3">
                      <div className="text-red-700 space-y-2">
                        {message.metadata.originalDocCount && message.metadata.rerankedDocCount && (
                          <div>
                            <span className="font-semibold">문서 처리:</span> {message.metadata.originalDocCount}개 → {message.metadata.rerankedDocCount}개 (Rerank)
                          </div>
                        )}
                        {message.metadata.topRerankScores && message.metadata.topRerankScores.length > 0 && (
                          <div>
                            <span className="font-semibold">상위 Rerank 점수:</span> {message.metadata.topRerankScores.map((score: number) => `${score}/10`).join(', ')}
                          </div>
                        )}
                        {message.metadata.compressionRatio && (
                          <div>
                            <span className="font-semibold">압축 비율:</span> {message.metadata.compressionRatio}
                          </div>
                        )}
                      </div>

                      {/* 원본 문서들 표시 */}
                      {message.metadata.originalDocuments && message.metadata.originalDocuments.length > 0 && (
                        <details className="border-t border-red-200 pt-2">
                          <summary className="cursor-pointer text-red-600 font-medium">
                            📄 1단계: 원본 문서들 ({message.metadata.originalDocuments.length}개)
                          </summary>
                          <div className="mt-2 space-y-2">
                            {message.metadata.originalDocuments.map((doc: any, index: number) => (
                              <div key={index} className="p-2 bg-red-100 rounded text-xs text-red-800">
                                <div className="font-medium mb-1">
                                  원본 {index + 1} (유사도: {doc.originalScore?.toFixed(3) || 'N/A'})
                                </div>
                                <div className="italic">{doc.text.substring(0, 200)}...</div>
                              </div>
                            ))}
                          </div>
                        </details>
                      )}

                      {/* 재평가된 문서들 표시 */}
                      {message.metadata.rerankedDocuments && message.metadata.rerankedDocuments.length > 0 && (
                        <details className="border-t border-red-200 pt-2">
                          <summary className="cursor-pointer text-red-600 font-medium">
                            ⚡ 2단계: 재평가 후 선별된 문서들 ({message.metadata.rerankedDocuments.length}개)
                          </summary>
                          <div className="mt-2 space-y-2">
                            {message.metadata.rerankedDocuments.map((doc: any, index: number) => (
                              <div key={index} className="p-2 bg-red-200 rounded text-xs text-red-800">
                                <div className="font-medium mb-1">재평가 문서 {index + 1}</div>
                                <div className="italic">{doc.text.substring(0, 200)}...</div>
                              </div>
                            ))}
                          </div>
                        </details>
                      )}

                      {/* 압축된 문서 표시 */}
                      {message.metadata.compressedDocument && (
                        <details className="border-t border-red-200 pt-2">
                          <summary className="cursor-pointer text-red-600 font-medium">
                            🗜️ 3단계: 최종 압축된 문서
                          </summary>
                          <div className="mt-2">
                            <div className="p-2 bg-red-300 rounded text-xs text-red-800">
                              <div className="font-medium mb-1">최종 압축 결과</div>
                              <div className="italic">{message.metadata.compressedDocument.text.substring(0, 500)}...</div>
                            </div>
                          </div>
                        </details>
                      )}
                    </div>
                  </details>
                )}

                {/* RLVR RAG 메타데이터 표시 */}
                {message.role === 'assistant' && message.ragModel === 'rlvr' && message.metadata && (
                  <details className="mt-3 text-sm">
                    <summary className="cursor-pointer text-purple-600 hover:text-purple-800">
                      🧠 RLVR RAG 처리 정보 (검증 & 추론)
                    </summary>
                    <div className="mt-2 p-3 bg-purple-50 rounded-lg border-l-4 border-purple-300 space-y-3">

                      {/* 문서 검증 결과 */}
                      {message.metadata.verification && (
                        <details className="border border-purple-200 rounded p-2">
                          <summary className="cursor-pointer text-purple-600 font-medium">
                            ✅ 1단계: 문서 검증 (Verification)
                          </summary>
                          <div className="mt-2 space-y-2">
                            <div className="text-purple-700 text-xs">
                              <strong>검증 요약:</strong> {message.metadata.verification.verificationSummary}
                            </div>
                            {message.metadata.verification.verifiedDocs && message.metadata.verification.verifiedDocs.length > 0 && (
                              <div className="space-y-1">
                                <div className="font-medium text-purple-600">검증된 문서들:</div>
                                {message.metadata.verification.verifiedDocs.map((doc: any, index: number) => (
                                  <div key={index} className="p-2 bg-purple-100 rounded text-xs">
                                    <div className="font-medium mb-1">
                                      문서 {index + 1} - 신뢰성: {doc.credibility}/10, 관련성: {doc.relevance}/10
                                    </div>
                                    <div className="italic text-purple-800">{doc.text.substring(0, 150)}...</div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </details>
                      )}

                      {/* 추론 과정 */}
                      {message.metadata.reasoning && (
                        <details className="border border-purple-200 rounded p-2">
                          <summary className="cursor-pointer text-purple-600 font-medium">
                            🤔 2단계: 단계별 추론 (Chain of Thought)
                          </summary>
                          <div className="mt-2 space-y-3">

                            {/* 사고 과정 */}
                            {message.metadata.reasoning.thinkingSteps && message.metadata.reasoning.thinkingSteps.length > 0 && (
                              <div>
                                <div className="font-medium text-purple-600 mb-1">💭 사고 과정:</div>
                                <div className="space-y-1">
                                  {message.metadata.reasoning.thinkingSteps.map((step: string, index: number) => (
                                    <div key={index} className="p-2 bg-purple-100 rounded text-xs">
                                      <span className="font-medium">단계 {index + 1}:</span> {step}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* 논리적 추론 체인 */}
                            {message.metadata.reasoning.logicalChain && message.metadata.reasoning.logicalChain.length > 0 && (
                              <div>
                                <div className="font-medium text-purple-600 mb-1">🔗 논리적 추론 체인:</div>
                                <div className="space-y-1">
                                  {message.metadata.reasoning.logicalChain.map((step: string, index: number) => (
                                    <div key={index} className="p-2 bg-purple-200 rounded text-xs">
                                      <span className="font-medium">추론 {index + 1}:</span> {step}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* 결론 */}
                            {message.metadata.reasoning.conclusion && (
                              <div>
                                <div className="font-medium text-purple-600 mb-1">🎯 중간 결론:</div>
                                <div className="p-2 bg-purple-300 rounded text-xs font-medium">
                                  {message.metadata.reasoning.conclusion}
                                </div>
                              </div>
                            )}
                          </div>
                        </details>
                      )}

                      {/* Chain of Thought 단계들 */}
                      {message.metadata.cotSteps && message.metadata.cotSteps.length > 0 && (
                        <details className="border border-purple-200 rounded p-2">
                          <summary className="cursor-pointer text-purple-600 font-medium">
                            🧠 3단계: 최종 CoT 과정
                          </summary>
                          <div className="mt-2 space-y-1">
                            {message.metadata.cotSteps.map((step: string, index: number) => (
                              <div key={index} className="p-2 bg-gradient-to-r from-purple-100 to-purple-200 rounded text-xs">
                                <span className="font-medium">CoT {index + 1}:</span> {step}
                              </div>
                            ))}
                          </div>
                        </details>
                      )}

                      {/* 원본 문서들 */}
                      {message.metadata.originalDocuments && message.metadata.originalDocuments.length > 0 && (
                        <details className="border-t border-purple-200 pt-2">
                          <summary className="cursor-pointer text-purple-600 font-medium">
                            📄 원본 검색 문서들 ({message.metadata.originalDocuments.length}개)
                          </summary>
                          <div className="mt-2 space-y-2">
                            {message.metadata.originalDocuments.map((doc: any, index: number) => (
                              <div key={index} className="p-2 bg-purple-50 rounded text-xs text-purple-800">
                                <div className="font-medium mb-1">
                                  원본 {index + 1} (유사도: {doc.originalScore?.toFixed(3) || 'N/A'})
                                </div>
                                <div className="italic">{doc.text.substring(0, 200)}...</div>
                              </div>
                            ))}
                          </div>
                        </details>
                      )}
                    </div>
                  </details>
                )}

                {message.originalText && message.originalText.length > 0 && (
                  <details className="mt-3 text-sm">
                    <summary className="cursor-pointer text-indigo-600 hover:text-indigo-800">
                      📖 참조 보기
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
                {mounted && (
                  <div className="text-xs mt-2 opacity-60 flex items-center gap-2">
                    {message.timestamp.toLocaleTimeString()}
                    {message.role === 'assistant' && message.ragModel && (
                      <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">
                        {message.ragModel === 'naive' && 'Naive'}
                        {message.ragModel === 'advanced' && 'Advanced'}
                        {message.ragModel === 'raptor' && 'Raptor'}
                        {message.ragModel === 'rerank' && 'Rerank'}
                        {message.ragModel === 'compressed' && 'Compressed'}
                        {message.ragModel === 'hybrid' && 'Hybrid'}
                        {message.ragModel === 'rlvr' && 'RLVR'}
                      </span>
                    )}
                  </div>
                )}
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
                  <span className="text-indigo-600">어린왕자가 답변을 생성하고 있어요...</span>
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
