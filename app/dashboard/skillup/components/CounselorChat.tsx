'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bot,
  Send,
  Plus,
  MessageSquare,
  Trash2,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import type { CounselorMessage, CounselorSessionSummary } from '@/lib/skillup/types';

export default function CounselorChat() {
  const [sessions, setSessions] = useState<CounselorSessionSummary[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<CounselorMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Load sessions
  const loadSessions = useCallback(async () => {
    try {
      const res = await fetch('/api/skillup/counselor/sessions');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) setSessions(data);
      }
    } catch {
      // ignore
    } finally {
      setLoadingSessions(false);
    }
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  // Load a specific session
  const loadSession = async (sessionId: string) => {
    setLoadingMessages(true);
    setActiveSessionId(sessionId);
    try {
      const res = await fetch(`/api/skillup/counselor/sessions/${sessionId}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
      }
    } catch {
      // ignore
    } finally {
      setLoadingMessages(false);
    }
  };

  // Start new chat
  const startNewChat = () => {
    setActiveSessionId(null);
    setMessages([]);
    setInput('');
  };

  // Delete session
  const deleteSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await fetch(`/api/skillup/counselor/sessions/${sessionId}`, {
        method: 'DELETE',
      });
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      if (activeSessionId === sessionId) {
        startNewChat();
      }
    } catch {
      // ignore
    }
  };

  // Send message
  const handleSend = async () => {
    if (!input.trim() || sending) return;

    const userMessage: CounselorMessage = {
      role: 'user',
      content: input.trim(),
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setSending(true);

    try {
      const res = await fetch('/api/skillup/counselor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage.content,
          sessionId: activeSessionId,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setMessages((prev) => [...prev, data.message]);

        if (data.sessionId) {
          setActiveSessionId(data.sessionId);
          // Update sessions list
          loadSessions();
        }
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: 'Sorry, I encountered an error. Please try again.',
            timestamp: new Date().toISOString(),
          },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'Network error. Please check your connection and try again.',
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex h-[calc(100vh-12rem)] bg-gray-900 rounded-xl overflow-hidden border border-gray-700">
      {/* Session Sidebar */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 260, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            className="bg-gray-800 border-r border-gray-700 flex flex-col overflow-hidden"
          >
            <div className="p-3 border-b border-gray-700">
              <button
                onClick={startNewChat}
                className="w-full flex items-center gap-2 px-3 py-2 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 transition"
              >
                <Plus className="w-4 h-4" />
                New Chat
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {loadingSessions ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="w-5 h-5 text-gray-500 animate-spin" />
                </div>
              ) : sessions.length === 0 ? (
                <p className="text-xs text-gray-500 text-center py-4">
                  No conversations yet
                </p>
              ) : (
                sessions.map((session) => (
                  <button
                    key={session.id}
                    onClick={() => loadSession(session.id)}
                    className={`w-full flex items-start gap-2 px-3 py-2 rounded-lg text-left text-sm transition group ${
                      activeSessionId === session.id
                        ? 'bg-gray-700 text-white'
                        : 'text-gray-400 hover:bg-gray-700/50 hover:text-white'
                    }`}
                  >
                    <MessageSquare className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="truncate">{session.title}</p>
                      <p className="text-[10px] text-gray-500">
                        {session.message_count} messages
                      </p>
                    </div>
                    <button
                      onClick={(e) => deleteSession(session.id, e)}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 transition"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </button>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Chat Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-700">
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            className="p-1 text-gray-400 hover:text-white transition"
          >
            <MessageSquare className="w-5 h-5" />
          </button>
          <div className="p-1.5 bg-purple-500/20 rounded-lg">
            <Bot className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white">AI Career Counselor</h2>
            <p className="text-[10px] text-gray-500">
              Advisory only — not a substitute for professional guidance
            </p>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {loadingMessages ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 text-purple-400 animate-spin" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-6">
              <div className="p-4 bg-purple-500/10 rounded-2xl mb-4">
                <Bot className="w-10 h-10 text-purple-400" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">
                Welcome to AI Career Counselor
              </h3>
              <p className="text-sm text-gray-400 max-w-md mb-6">
                Get personalized career guidance based on your skills, goals, and
                market demand. Ask about career paths, skill gaps, or course
                recommendations.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {[
                  'What skills should I focus on?',
                  'Suggest a career path for me',
                  'How can I improve my profile?',
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => {
                      setInput(suggestion);
                    }}
                    className="px-3 py-1.5 bg-gray-800 text-gray-300 text-xs rounded-full hover:bg-gray-700 hover:text-white transition"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
              <div className="mt-6 flex items-start gap-2 text-xs text-gray-500 max-w-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>
                  All suggestions are advisory only and should not be the sole
                  basis for career decisions. Protected characteristics are not
                  considered.
                </span>
              </div>
            </div>
          ) : (
            <>
              <AnimatePresence>
                {messages.map((msg, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                    className={`flex ${
                      msg.role === 'user' ? 'justify-end' : 'justify-start'
                    }`}
                  >
                    <div
                      className={`max-w-[80%] rounded-xl px-4 py-3 ${
                        msg.role === 'user'
                          ? 'bg-purple-600 text-white'
                          : 'bg-gray-800 text-gray-200'
                      }`}
                    >
                      {msg.role === 'assistant' && (
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <Bot className="w-3.5 h-3.5 text-purple-400" />
                          <span className="text-[10px] text-purple-400 font-medium">
                            AI Counselor
                          </span>
                        </div>
                      )}
                      <div className="text-sm whitespace-pre-wrap leading-relaxed">
                        {msg.content}
                      </div>
                      <p className="text-[10px] mt-1.5 opacity-50">
                        {new Date(msg.timestamp).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>

              {sending && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex justify-start"
                >
                  <div className="bg-gray-800 rounded-xl px-4 py-3">
                    <div className="flex items-center gap-2 text-sm text-gray-400">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Thinking...
                    </div>
                  </div>
                </motion.div>
              )}
            </>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Advisory disclaimer (shown when messages exist) */}
        {messages.length > 0 && (
          <div className="px-4 py-1">
            <p className="text-[10px] text-gray-600 text-center">
              AI suggestions are advisory only. Not a substitute for professional career guidance.
            </p>
          </div>
        )}

        {/* Input */}
        <div className="border-t border-gray-700 p-3">
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about career paths, skills, courses..."
              rows={1}
              className="flex-1 px-4 py-2.5 bg-gray-800 border border-gray-600 rounded-xl text-white text-sm placeholder-gray-500 resize-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 focus:outline-none"
              style={{
                minHeight: '42px',
                maxHeight: '120px',
              }}
              disabled={sending}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || sending}
              className="p-2.5 bg-purple-600 text-white rounded-xl hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {sending ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
