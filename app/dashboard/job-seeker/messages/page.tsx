'use client';

import { useEffect, useState, useRef } from 'react';
import { MessageSquare, Send, ArrowLeft, User } from 'lucide-react';

interface Conversation {
  partnerId: string;
  lastMessage: {
    body: string;
    created_at: string;
    sender_id: string;
  };
  unreadCount: number;
  partner: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
    role: string;
  } | null;
}

interface Message {
  id: string;
  sender_id: string;
  receiver_id: string;
  body: string;
  read_at: string | null;
  created_at: string;
}

export default function JobSeekerMessagesPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedPartner, setSelectedPartner] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/messages')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.conversations) setConversations(data.conversations);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedPartner) return;
    fetch(`/api/messages?with=${selectedPartner}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.messages) setMessages(data.messages);
      })
      .catch(() => {});
  }, [selectedPartner]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!newMessage.trim() || !selectedPartner || sending) return;
    setSending(true);
    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiverId: selectedPartner, message: newMessage.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setMessages((prev) => [...prev, data.message]);
        setNewMessage('');
        fetch('/api/messages')
          .then((r) => r.json())
          .then((d) => d?.conversations && setConversations(d.conversations))
          .catch(() => {});
      }
    } catch {
      // silent
    } finally {
      setSending(false);
    }
  }

  function formatTime(dateString: string) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    if (diffHours < 1) return `${Math.max(1, Math.round(diffMs / 60000))}m`;
    if (diffHours < 24) return `${Math.round(diffHours)}h`;
    if (diffHours < 168) return `${Math.round(diffHours / 24)}d`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  const selectedConv = conversations.find((c) => c.partnerId === selectedPartner);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500/30 border-t-blue-500" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-6 text-2xl font-bold text-white">Messages</h1>

      <div className="flex h-[calc(100vh-12rem)] rounded-xl border border-gray-700 bg-gray-800 overflow-hidden">
        {/* Conversation list */}
        <div
          className={`w-80 border-r border-gray-700 flex-shrink-0 overflow-y-auto ${
            selectedPartner ? 'hidden md:block' : ''
          }`}
        >
          {conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-6">
              <MessageSquare className="h-12 w-12 text-gray-600 mb-3" />
              <p className="text-gray-400 text-sm">No messages yet</p>
              <p className="text-gray-500 text-xs mt-1">
                Messages from recruiters will appear here
              </p>
            </div>
          ) : (
            conversations.map((conv) => (
              <button
                key={conv.partnerId}
                onClick={() => setSelectedPartner(conv.partnerId)}
                className={`w-full flex items-start gap-3 p-4 text-left border-b border-gray-700/50 transition-colors ${
                  selectedPartner === conv.partnerId ? 'bg-gray-700' : 'hover:bg-gray-700/50'
                }`}
              >
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gray-600">
                  {conv.partner?.avatar_url ? (
                    <img src={conv.partner.avatar_url} alt="" className="h-10 w-10 rounded-full object-cover" />
                  ) : (
                    <User className="h-5 w-5 text-gray-400" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-white truncate">
                      {conv.partner?.full_name || 'Unknown'}
                    </span>
                    <span className="text-xs text-gray-500 flex-shrink-0">
                      {formatTime(conv.lastMessage.created_at)}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 truncate mt-0.5">{conv.lastMessage.body}</p>
                </div>
                {conv.unreadCount > 0 && (
                  <span className="flex-shrink-0 flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white">
                    {conv.unreadCount}
                  </span>
                )}
              </button>
            ))
          )}
        </div>

        {/* Message view */}
        <div className={`flex-1 flex flex-col ${!selectedPartner ? 'hidden md:flex' : ''}`}>
          {!selectedPartner ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <MessageSquare className="h-16 w-16 text-gray-600 mb-3" />
              <p className="text-gray-400">Select a conversation</p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 border-b border-gray-700 p-4">
                <button onClick={() => setSelectedPartner(null)} className="md:hidden p-1 text-gray-400 hover:text-white">
                  <ArrowLeft className="h-5 w-5" />
                </button>
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-600">
                  <User className="h-4 w-4 text-gray-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-white">{selectedConv?.partner?.full_name || 'Unknown'}</p>
                  <p className="text-xs text-gray-500 capitalize">{selectedConv?.partner?.role?.replace('_', ' ') || ''}</p>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.map((msg) => {
                  const isMine = msg.sender_id !== selectedPartner;
                  return (
                    <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[70%] rounded-2xl px-4 py-2.5 ${isMine ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-100'}`}>
                        <p className="text-sm whitespace-pre-wrap">{msg.body}</p>
                        <p className={`text-[10px] mt-1 ${isMine ? 'text-blue-200' : 'text-gray-500'}`}>{formatTime(msg.created_at)}</p>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              <form onSubmit={handleSend} className="flex items-center gap-2 border-t border-gray-700 p-4">
                <input
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Type a message..."
                  className="flex-1 rounded-lg border border-gray-600 bg-gray-700 px-4 py-2.5 text-sm text-white placeholder-gray-400 focus:border-blue-500 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={sending || !newMessage.trim()}
                  className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  <Send className="h-4 w-4" />
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
