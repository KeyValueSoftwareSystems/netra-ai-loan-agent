"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Dialog,
  DialogContent,
  DialogTrigger,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog"
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover"
import { MessageCircle, Send, Bot, Trash2, X, ChevronDown, Check, Cpu, ChevronRight } from "lucide-react"
import Markdown from "react-markdown"
import remarkGfm from "remark-gfm"

const API_URL = "http://localhost:8000"

type Message = {
  role: 'user' | 'ai'
  content: string
}

type ProviderInfo = {
  id: string
  name: string
  models: string[]
}

const PROVIDER_ICONS: Record<string, string> = {
  openai: "O",
  anthropic: "A",
  google: "G",
  litellm: "L",
}

const PROVIDER_COLORS: Record<string, string> = {
  openai: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  anthropic: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  google: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  litellm: "bg-purple-500/15 text-purple-400 border-purple-500/30",
}

export function AskAI() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [providers, setProviders] = useState<ProviderInfo[]>([])
  const [currentProvider, setCurrentProvider] = useState<string>("")
  const [currentModel, setCurrentModel] = useState<string>("")
  const [modelSwitching, setModelSwitching] = useState(false)
  const [modelPopoverOpen, setModelPopoverOpen] = useState(false)
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const fetchProviders = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/providers`)
      if (!res.ok) return
      const data = await res.json()
      setProviders(data.providers ?? [])
      setCurrentProvider(data.currentProvider ?? "")
      setCurrentModel(data.currentModel ?? "")
      if (data.currentProvider) {
        setExpandedProvider(data.currentProvider)
      }
    } catch {
      // backend not reachable yet
    }
  }, [])

  useEffect(() => {
    fetchProviders()
  }, [fetchProviders])

  const switchModel = async (model: string, provider: string) => {
    if (model === currentModel && provider === currentProvider) {
      setModelPopoverOpen(false)
      return
    }
    setModelSwitching(true)
    try {
      const res = await fetch(`${API_URL}/model`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, provider }),
      })
      if (!res.ok) throw new Error("Failed to switch model")
      const data = await res.json()
      setCurrentModel(data.current)
      setCurrentProvider(data.provider)
    } catch (err) {
      console.error("Model switch error:", err)
    } finally {
      setModelSwitching(false)
      setModelPopoverOpen(false)
    }
  }

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages, loading])

  const handleSend = async () => {
    if (!input.trim()) return

    const userMessage: Message = { role: 'user', content: input }
    setMessages((prev) => [...prev, userMessage])
    setInput("")
    setLoading(true)

    try {
      const response = await fetch(`${API_URL}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: input,
          thread_id: localStorage.getItem("thread_id") || null,
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to fetch response")
      }

      const data = await response.json()
      
      if (data.thread_id) {
        localStorage.setItem("thread_id", data.thread_id)
      }

      const aiMessage: Message = { 
        role: 'ai', 
        content: data.response || "Sorry, I couldn't understand that."
      }
      setMessages((prev) => [...prev, aiMessage])
    } catch (error) {
      console.error("Error fetching AI response:", error)
      const errorMessage: Message = { 
        role: 'ai', 
        content: "Sorry, something went wrong. Please try again later."
      }
      setMessages((prev) => [...prev, errorMessage])
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const clearChat = () => {
    setMessages([])
    localStorage.removeItem("thread_id")
  }

  const activeProvider = providers.find((p) => p.id === currentProvider)

  return (
    <Dialog onOpenChange={(open) => {
      if (!open) {
        clearChat()
      }
    }}>
      <DialogTrigger asChild>
        <Button 
          className="fixed bottom-8 right-8 h-16 w-16 rounded-full shadow-lg hover:shadow-xl transition-all duration-300 z-50 bg-primary hover:bg-primary/90" 
          size="icon"
        >
          <MessageCircle className="h-8 w-8" />
          <span className="sr-only">Ask AI</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] md:max-w-[700px] h-[600px] md:h-[700px] flex flex-col p-0 gap-0">
        <DialogTitle className="sr-only">Chat with AI Assistant</DialogTitle>
        <DialogDescription className="sr-only">Ask questions about Meridian Bank services and get instant support.</DialogDescription>
        <div className="flex items-center justify-between p-4 border-b bg-background/50 backdrop-blur-sm sticky top-0 z-10 rounded-t-md">
          <div className="flex items-center gap-2">
            <div className="bg-primary/10 p-2 rounded-lg">
              <Bot className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-sm">Meridian Assistant</h3>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </span>
                Online
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {providers.length > 0 && (
              <Popover open={modelPopoverOpen} onOpenChange={setModelPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1.5 text-xs font-normal px-2 border-border/60"
                    disabled={modelSwitching}
                  >
                    {activeProvider && (
                      <span className={`inline-flex items-center justify-center h-4 w-4 rounded text-[9px] font-bold border ${PROVIDER_COLORS[activeProvider.id] ?? "bg-muted text-muted-foreground border-border"}`}>
                        {PROVIDER_ICONS[activeProvider.id] ?? "?"}
                      </span>
                    )}
                    <Cpu className="h-3 w-3 text-muted-foreground" />
                    <span className="max-w-[100px] truncate">{currentModel || "model"}</span>
                    <ChevronDown className="h-3 w-3 text-muted-foreground" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-64 p-1.5">
                  <div className="flex flex-col gap-0.5">
                    {providers.map((provider) => {
                      const isExpanded = expandedProvider === provider.id
                      const isActive = provider.id === currentProvider
                      return (
                        <div key={provider.id}>
                          <button
                            onClick={() => setExpandedProvider(isExpanded ? null : provider.id)}
                            className={`flex items-center gap-2 w-full rounded-md px-2 py-2 text-xs cursor-pointer transition-colors ${
                              isActive ? "bg-muted/60" : "hover:bg-muted/40"
                            }`}
                          >
                            <span className={`inline-flex items-center justify-center h-5 w-5 rounded text-[10px] font-bold border ${PROVIDER_COLORS[provider.id] ?? "bg-muted text-muted-foreground border-border"}`}>
                              {PROVIDER_ICONS[provider.id] ?? "?"}
                            </span>
                            <span className="font-medium flex-1 text-left">{provider.name}</span>
                            <span className="text-[10px] text-muted-foreground tabular-nums">{provider.models.length} models</span>
                            <ChevronRight className={`h-3 w-3 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                          </button>
                          {isExpanded && (
                            <div className="ml-3 pl-4 border-l border-border/50 mt-0.5 mb-1 flex flex-col gap-0.5">
                              {provider.models.map((m) => {
                                const isCurrentModel = m === currentModel && provider.id === currentProvider
                                return (
                                  <button
                                    key={m}
                                    onClick={() => switchModel(m, provider.id)}
                                    disabled={modelSwitching}
                                    className={`flex items-center justify-between w-full rounded-md px-2.5 py-1.5 text-[11px] cursor-pointer transition-colors ${
                                      isCurrentModel
                                        ? "bg-primary/10 text-primary font-medium"
                                        : "hover:bg-muted text-foreground"
                                    }`}
                                  >
                                    <span className="font-mono">{m}</span>
                                    {isCurrentModel && <Check className="h-3 w-3 shrink-0" />}
                                  </button>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </PopoverContent>
              </Popover>
            )}
            <DialogClose asChild>
              <Button onClick={clearChat} variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-muted">
                <X className="h-4 w-4" />
                <span className="sr-only">Close</span>
              </Button>
            </DialogClose>
          </div>
        </div>
        
        <ScrollArea className="flex-1 p-4 h-0">
          <div className={`flex flex-col gap-4 min-h-full ${messages.length === 0 ? 'justify-center' : ''}`}>
            {messages.length === 0 && (
              <div className="text-center text-muted-foreground text-sm py-8 space-y-4">
                <div className="bg-primary/5 p-4 rounded-full w-20 h-20 mx-auto flex items-center justify-center mb-4">
                    <Bot className="h-10 w-10 text-primary opacity-80" />
                </div>
                <div className="space-y-2">
                    <p className="font-semibold text-xl text-foreground">Welcome to Meridian Bank Support</p>
                    <p className="text-muted-foreground w-3/4 mx-auto">Get instant support for banking products, services, and account management inquiries.</p>
                </div>
              </div>
            )}
            
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex gap-2 text-sm ${
                  msg.role === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                {msg.role === 'ai' && (
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Bot className="h-4 w-4 text-primary" />
                  </div>
                )}
                
                <div
                  className={`rounded-2xl px-4 py-2 max-w-[80%] break-words prose-strong:text-foreground prose prose-p:my-0 prose-table:my-1 prose:text-sm text-foreground prose-th:text-foreground ${
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground rounded-br-none'
                      : 'bg-muted rounded-bl-none'
                  }`}
                >
                  <Markdown remarkPlugins={[remarkGfm]}>{msg.content}</Markdown>
                </div>
              </div>
            ))}
            
            {loading && (
              <div className="flex gap-2 justify-start">
                 <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Bot className="h-4 w-4 text-primary" />
                  </div>
                <div className="bg-muted rounded-2xl rounded-bl-none px-4 py-2 text-sm text-muted-foreground animate-pulse flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-current rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                  <span className="w-1.5 h-1.5 bg-current rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                  <span className="w-1.5 h-1.5 bg-current rounded-full animate-bounce"></span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>
        
        <div className="p-3 border-t bg-background/50 flex gap-2 items-end">
          
          <Input 
            value={input} 
            onChange={(e) => setInput(e.target.value)} 
            onKeyDown={handleKeyDown}
            placeholder="Type your question..." 
            className="flex-1 focus-visible:ring-1 min-h-[40px]"
            disabled={loading}
          />
          <Button variant="ghost" size="icon" onClick={clearChat} title="Clear Chat" className="shrink-0">
            <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
          </Button>
          <Button 
            onClick={handleSend} 
            size="icon" 
            disabled={!input.trim() || loading}
            className={!input.trim() ? "opacity-50" : ""}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
