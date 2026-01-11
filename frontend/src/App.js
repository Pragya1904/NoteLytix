import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { groupMeetingsByDate } from './utils/meetingUtils';
import { useAudioRecorder } from './hooks/useAudioRecorder';
import SummaryRenderer from './components/SummaryRenderer';
import MeetingNotes from './components/MeetingNotes';
import {
  Mic, Square, Pause, Play, MoreHorizontal, Search,
  Plus, Share, MessageSquare, Mail, Folder, Calendar,
  User, Settings, X, ChevronLeft, Check, AlertCircle,
  FileText, Loader2, Download, Volume2, PenTool, Layout,
  AlertTriangle, LogOut, Shield
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";

// States
const APP_STATES = {
  SIGNIN: 'SIGNIN',
  IDLE: 'IDLE',
  CONNECTING: 'CONNECTING',
  RECORDING: 'RECORDING',
  PAUSED: 'PAUSED',
  BUFFERING: 'BUFFERING',
  ERROR: 'ERROR',
  STOPPED: 'STOPPED',
};

const SummaryButton = ({ onClick, hasSummary, animate = false }) => (
  <Button
    size="lg"
    className={cn(
      "rounded-full px-8 bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/30 h-12 font-medium transition-all hover:shadow-primary/40",
      animate && "animate-pulse-slow"
    )}
    onClick={onClick}
  >
    <PenTool className="h-5 w-5 mr-2" />
    {hasSummary ? 'Rewrite Summary' : 'Generate Summary'}
  </Button>
);

export default function NotelytixApp() {
  const [appState, setAppState] = useState(APP_STATES.IDLE);
  const [showSummary, setShowSummary] = useState(false);
  const [summaryContent, setSummaryContent] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [meetingTitle, setMeetingTitle] = useState("Untitled meeting");
  const [currentView, setCurrentView] = useState('home'); // 'home', 'recording', or 'list'
  const [meetings, setMeetings] = useState([]);
  const [isHistoryDetail, setIsHistoryDetail] = useState(false);
  const [customNotes, setCustomNotes] = useState('');
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);

  const [userEmail, setUserEmail] = useState(() => {
    const token = localStorage.getItem("authToken");
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        return payload.email;
      } catch (e) {
        console.error("Failed to decode token", e);
      }
    }
    return null;
  });

  const {
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    transcript,
    error,
    isRecording,
    meetingId
  } = useAudioRecorder(userEmail);

  // Error handling effect
  useEffect(() => {
    if (error) {
      toast.error(error);
      setAppState(APP_STATES.IDLE);
    }
  }, [error]);

  const handleStartRecording = async () => {
    setAppState(APP_STATES.CONNECTING);
    try {
      await startRecording();
      setAppState(APP_STATES.RECORDING);
      setIsHistoryDetail(false);
      toast.success("Recording started");

      // Trigger title generation after a short delay or when transcript starts?
      // For now, we wait for backend to do it automatically or we trigger it at the end.
    } catch (err) {
      console.error("Failed to start", err);
      setAppState(APP_STATES.ERROR);
    }
  };

  const handleStopRecording = () => {
    stopRecording();
    setAppState(APP_STATES.STOPPED);
    toast.success("Recording saved");

    // Trigger title generation automatically
    if (meetingId) {
      axios.post('http://localhost:8084/v1/llm/generate_title', { meeting_id: meetingId });
    }
  };

  const handlePauseRecording = () => {
    pauseRecording();
    setAppState(APP_STATES.PAUSED);
    console.log("Recording paused");
  };

  const handleResumeRecording = () => {
    resumeRecording();
    setAppState(APP_STATES.RECORDING);
    console.log("Recording resumed");
  };

  const handleGenerateSummary = async () => {
    // 1. Determine the correct ID to use
    // If it's history, use the currentMeetingId from local storage
    // If it's a live recording just stopped, use meetingId from hook
    const idToUse = isHistoryDetail
      ? localStorage.getItem("currentMeetingId")
      : meetingId;

    if (!idToUse) {
      console.warn("No meeting ID available to generate summary.");
      toast.error("Please select a meeting or wait for recording to finish.");
      return;
    }

    console.log(`Generating summary for Meeting ID: ${idToUse} (History: ${isHistoryDetail})`);
    setAppState(APP_STATES.BUFFERING);

    try {
      if (isHistoryDetail) {
        // A. Trigger historical summary generation via meetings service
        await axios.get(`http://localhost:8083/meeting/generate_summary/${idToUse}`);
        toast.info("Summary generation started...");
        // Polling will handle the rest via the existing useEffect or a manual trigger
      } else {
        // B. Request immediate summary generation for live recording (direct to LLM service)
        const response = await axios.post('http://localhost:8084/v1/llm/generate_summary', {
          meeting_id: parseInt(idToUse)
        });

        console.log("Summary Response:", response.data);
        const { summary } = response.data;

        // Update State
        setSummaryContent(summary);
        setShowSummary(true);
        setAppState(APP_STATES.STOPPED);
        toast.success("Summary generated successfully!");
      }
    } catch (err) {
      console.error("Summary generation failed", err);
      toast.error("Failed to trigger summary generation.");
      setAppState(isHistoryDetail ? APP_STATES.IDLE : APP_STATES.STOPPED);
    }
  };

  const handleViewMeetings = async () => {
    if (!userEmail) {
      toast.error("Please sign in first");
      return;
    }
    try {
      const res = await axios.get(`http://localhost:8083/meeting/list?user_email=${userEmail}`);
      setMeetings(res.data || []);
      setCurrentView('list');
      setIsSidebarOpen(false);
    } catch (err) {
      toast.error("Failed to fetch meetings");
    }
  };

  const handleSelectMeeting = async (id) => {
    try {
      const res = await axios.get(`http://localhost:8083/meeting/${id}`);
      if (res.data) {
        setMeetingTitle(res.data.title || "Untitled meeting");
        setSummaryContent(res.data.summary || null);
        setShowSummary(!!res.data.summary);
        // Manual transcript update if needed, but for now we look at the meeting
        localStorage.setItem("currentMeetingId", id);
        setCurrentView('recording');
        setIsHistoryDetail(true);
        setAppState(APP_STATES.IDLE);
      }
    } catch (err) {
      toast.error("Failed to load meeting details");
    }
  };


  const handleLogin = () => {
    window.location.href = "http://localhost:8081/auth/google";
  };

  const handleSignOut = () => {
    localStorage.removeItem("authToken");
    localStorage.removeItem("currentMeetingId");
    setAppState(APP_STATES.SIGNIN);
    setUserEmail(null);
    setCurrentView('home');
    setShowLogoutDialog(false);
  };

  const handleNewNote = () => {
    setCurrentView('recording');
    setIsHistoryDetail(false);
    setAppState(APP_STATES.IDLE);
    setMeetingTitle("Untitled meeting");
    setSummaryContent(null);
    setShowSummary(false);
    localStorage.removeItem("currentMeetingId");
    setIsSidebarOpen(false);
  };

  const handleTitleUpdate = async (newTitle) => {
    setMeetingTitle(newTitle);
    const idToUpdate = meetingId || localStorage.getItem("currentMeetingId");
    if (idToUpdate) {
      try {
        await axios.patch('http://localhost:8083/meeting/update', {
          meeting_id: parseInt(idToUpdate),
          title: newTitle
        });
        toast.success("Title updated");
      } catch (err) {
        console.error("Failed to update title", err);
      }
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");

    if (token) {
      localStorage.setItem("authToken", token);
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        setUserEmail(payload.email);
      } catch (e) { console.error(e); }
      window.history.replaceState({}, document.title, window.location.pathname);
    } else {
      const storedToken = localStorage.getItem("authToken");
      if (storedToken) {
        try {
          setUserEmail(JSON.parse(atob(storedToken.split('.')[1])).email);
        } catch (e) { }
      }
    }

    const storedMeetingId = localStorage.getItem("currentMeetingId");
    if (storedMeetingId) {
      handleSelectMeeting(storedMeetingId);
    }
  }, []);

  // Polling for automated updates (Title & Summary)
  useEffect(() => {
    let interval;
    const shouldPoll = appState === APP_STATES.STOPPED ||
      appState === APP_STATES.IDLE ||
      appState === APP_STATES.RECORDING ||
      appState === APP_STATES.BUFFERING;

    if (shouldPoll) {
      const idToCheck = meetingId || localStorage.getItem("currentMeetingId");
      if (idToCheck) {
        interval = setInterval(async () => {
          try {
            const res = await axios.get(`http://localhost:8083/meeting/${idToCheck}`);
            if (res.data) {
              // 1. Update Title if it looks like a real title (and not a timestamp)
              if (res.data.title &&
                !res.data.title.startsWith("Meeting 20") &&
                res.data.title !== "Untitled meeting" &&
                res.data.title !== meetingTitle) {
                setMeetingTitle(res.data.title);
              }

              // 2. Update Summary if it's newly available
              if (res.data.summary && res.data.summary !== summaryContent) {
                setSummaryContent(res.data.summary);
                setShowSummary(true);

                // If we were waiting for it, reset the app state
                if (appState === APP_STATES.BUFFERING) {
                  setAppState(isHistoryDetail ? APP_STATES.IDLE : APP_STATES.STOPPED);
                  toast.success("Summary is ready!");
                }
              }

              // Stop polling if we got everything we needed in a non-recording state
              if (appState !== APP_STATES.RECORDING && res.data.summary && res.data.title) {
                // Potential to clear interval here, but safer to keep it for manual changes
              }
            }
          } catch (e) { /* ignore */ }
        }, 3000);
      }
    }
    return () => clearInterval(interval);
  }, [appState, meetingId, summaryContent, meetingTitle, isHistoryDetail]);

  if (appState === APP_STATES.SIGNIN) {
    return (
      <div className="flex h-screen w-full bg-[#FAFAFA] items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-border p-8 text-center space-y-6">
          <div className="mx-auto w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-4">
            <div className="w-8 h-8 bg-primary rounded-full" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Welcome to NoteLytix</h1>
          <p className="text-muted-foreground">Sign in to start capturing your meetings.</p>

          <Button size="lg" className="w-full rounded-full h-12 text-base bg-white border border-border text-foreground hover:bg-gray-50 shadow-sm" onClick={handleLogin}>
            <svg className="mr-2 h-5 w-5" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            Continue with Google
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full bg-[#FAFAFA] text-foreground overflow-hidden font-sans selection:bg-primary/20">
      {/* Sidebar */}
      <div className={cn(
        "bg-white border-r border-border transition-all duration-300 ease-in-out flex flex-col z-20 shadow-lg absolute inset-y-0 left-0 lg:relative lg:shadow-none",
        isSidebarOpen ? "w-64 translate-x-0" : "-translate-x-full lg:w-0 lg:translate-x-0 lg:opacity-0 lg:overflow-hidden lg:border-none"
      )}>
        <div className="p-6 flex items-center justify-between font-semibold text-lg text-primary">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <div className="w-4 h-4 bg-primary rounded-full" />
            </div>
            Notelytix
          </div>
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setIsSidebarOpen(false)}>
            <X className="h-5 w-5" />
          </Button>
        </div>
        <div className="px-3 py-2 space-y-1">
          <Button variant="ghost" className="w-full justify-start text-muted-foreground hover:text-foreground h-10 rounded-lg" onClick={() => setCurrentView('home')}>
            <Layout className="mr-3 h-4 w-4" /> Home
          </Button>
          <Button variant="ghost" className="w-full justify-start text-muted-foreground hover:text-foreground h-10 rounded-lg" onClick={handleViewMeetings}>
            <Calendar className="mr-3 h-4 w-4" /> Meetings
          </Button>
          <Button variant="ghost" className="w-full justify-start text-muted-foreground hover:text-foreground h-10 rounded-lg">
            <FileText className="mr-3 h-4 w-4" /> Notes
          </Button>
          <Button variant="ghost" className="w-full justify-start text-muted-foreground hover:text-foreground h-10 rounded-lg" onClick={() => setShowSettings(true)}>
            <Settings className="mr-3 h-4 w-4" /> Settings
          </Button>
        </div>
        <div className="mt-auto p-4 border-t border-border">
          <div className="bg-secondary/50 rounded-lg p-3 flex items-center gap-3">
            <Avatar className="h-8 w-8">
              <AvatarImage src="https://github.com/shadcn.png" />
              <AvatarFallback>{userEmail ? userEmail.substring(0, 2).toUpperCase() : 'JD'}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{userEmail ? userEmail.split('@')[0] : 'User'}</p>
              <p className="text-xs text-muted-foreground truncate">{userEmail || 'user@example.com'}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col relative min-w-0 bg-[#FAFAFA]">
        {/* Top Navigation */}
        <header className="h-[60px] bg-white/80 backdrop-blur-md border-b border-border flex items-center justify-between px-6 shrink-0 z-10 sticky top-0">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="text-muted-foreground hover:bg-secondary rounded-full">
              {isSidebarOpen ? <ChevronLeft className="h-5 w-5" /> : <Layout className="h-5 w-5" />}
            </Button>
          </div>

          <div className="flex-1 max-w-md mx-auto">
            <div className="relative group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
              <Input
                className="pl-10 rounded-full bg-secondary/30 border-transparent hover:bg-secondary focus:bg-white focus:ring-1 focus:ring-primary/20 transition-all"
                placeholder="Search notes..."
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="rounded-full h-8 bg-white hover:bg-gray-50 hidden sm:flex border-dashed text-muted-foreground hover:text-foreground"
              onClick={handleNewNote}
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              New Note
            </Button>
            <Button variant="ghost" size="icon" className="rounded-full text-muted-foreground hover:text-primary hover:bg-primary/5">
              <Share className="h-4 w-4" />
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full text-muted-foreground hover:text-primary hover:bg-primary/5" aria-label="More options">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => setShowSettings(true)}>
                  <Settings className="mr-2 h-4 w-4" /> Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs text-muted-foreground">Debug: Force State</DropdownMenuLabel>
                {Object.values(APP_STATES).map(state => (
                  <DropdownMenuItem key={state} onClick={() => setAppState(state)} className="text-xs font-mono">
                    {state}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut} className="text-red-600 focus:text-red-600">
                  <LogOut className="mr-2 h-4 w-4" /> Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Avatar className="h-8 w-8 border border-border ml-2 cursor-pointer transition-transform hover:scale-105">
                  <AvatarImage src="https://github.com/shadcn.png" />
                  <AvatarFallback>{userEmail ? userEmail.substring(0, 2).toUpperCase() : 'CN'}</AvatarFallback>
                </Avatar>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel>My Account</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setShowLogoutDialog(true)} className="text-red-600 focus:text-red-600">
                  <LogOut className="mr-2 h-4 w-4" /> Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Beta Banner (Visible when Recording) */}
        {appState === APP_STATES.RECORDING && (
          <div className="bg-emerald-50/60 border-b border-emerald-100 px-4 py-1.5 text-center text-xs font-medium text-emerald-800 flex items-center justify-center animate-fade-in">
            <Shield className="h-3 w-3 mr-2" />
            Echo cancellation is in beta on Windows.
          </div>
        )}

        {/* Buffering Banner */}
        {appState === APP_STATES.BUFFERING && (
          <div className="bg-yellow-50 border-b border-yellow-100 px-4 py-1.5 text-center text-xs font-medium text-yellow-800 flex items-center justify-center animate-pulse">
            <Loader2 className="h-3 w-3 mr-2 animate-spin" />
            Sending audio... hold on
          </div>
        )}

        <main className="flex-1 overflow-y-auto p-4 md:p-8 relative">
          {currentView === 'home' && (
            <div className="max-w-4xl mx-auto h-full flex flex-col items-center justify-center text-center space-y-6">
              <div className="w-20 h-20 bg-primary/5 rounded-3xl flex items-center justify-center animate-pulse-slow">
                <Layout className="h-10 w-10 text-primary/40" />
              </div>
              <div className="space-y-2">
                <h2 className="text-3xl font-bold tracking-tight text-foreground">Analytics Dashboard</h2>
                <p className="text-lg text-muted-foreground font-medium">Coming soon...</p>
              </div>
              <p className="max-w-md text-muted-foreground/60 leading-relaxed">
                We're building a powerful analytics suite to help you track meeting productivity
                and extract insights across all your conversations.
              </p>
              <Button
                onClick={handleNewNote}
                className="mt-4 rounded-full px-8 bg-primary shadow-lg shadow-primary/20"
              >
                <Plus className="mr-2 h-4 w-4" /> Start your first note
              </Button>
            </div>
          )}

          {currentView === 'recording' ? (
            <div className="max-w-6xl mx-auto h-full flex flex-col">
              {/* Meeting Header */}
              <div className="text-center space-y-4 mb-8 animate-fade-in shrink-0">
                <h1
                  className="text-3xl md:text-4xl font-semibold tracking-tight text-foreground outline-none"
                  contentEditable
                  suppressContentEditableWarning
                  onBlur={(e) => handleTitleUpdate(e.target.innerText)}
                >
                  {meetingTitle}
                </h1>
                <div className="flex items-center justify-center gap-3 text-sm">
                  <Badge variant="secondary" className="rounded-full px-3 py-1 font-normal text-muted-foreground bg-white border border-border shadow-sm hover:bg-secondary/80">
                    <Calendar className="h-3 w-3 mr-2" />
                    Today
                  </Badge>
                  <Badge variant="secondary" className="rounded-full px-3 py-1 font-normal text-muted-foreground bg-white border border-border shadow-sm hover:bg-secondary/80">
                    <User className="h-3 w-3 mr-2" />
                    {userEmail ? userEmail.split('@')[0] : 'Me'}
                  </Badge>
                  <Badge variant="outline" className="rounded-full px-3 py-1 font-normal text-muted-foreground hover:bg-secondary cursor-pointer border-dashed border-border transition-colors">
                    <Folder className="h-3 w-3 mr-2" />
                    Add to folder
                  </Badge>
                </div>
              </div>

              {/* ... dynamic content columns (Transcript / Summary) ... */}
              <div className="flex-1 flex flex-col lg:flex-row gap-8 min-h-0">
                <div className={cn(
                  "flex-1 flex flex-col transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]",
                  showSummary ? "lg:w-1/2" : "w-full"
                )}>
                  {isHistoryDetail ? (
                    <MeetingNotes
                      initialNotes={customNotes}
                      onSave={setCustomNotes}
                    />
                  ) : (
                    <div className="bg-white rounded-2xl border border-border shadow-sm flex-1 overflow-hidden flex flex-col relative">

                      {/* Header for Transcript Box */}
                      <div className="px-4 py-3 border-b border-border bg-gray-50/30 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className={cn("w-2 h-2 rounded-full", (appState === APP_STATES.RECORDING && !isHistoryDetail) ? "bg-red-500 animate-pulse" : "bg-gray-300")} />
                          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            {isHistoryDetail ? 'Transcript' : (appState === APP_STATES.RECORDING ? 'Live' : 'Transcript')}
                          </span>
                        </div>
                        {appState === APP_STATES.STOPPED && (
                          <div className="flex gap-2">
                            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs"><Download className="h-3 w-3 mr-1" /> Audio</Button>
                            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs"><Download className="h-3 w-3 mr-1" /> Text</Button>
                          </div>
                        )}
                      </div>

                      {appState === APP_STATES.CONNECTING && (
                        <div className="absolute inset-0 z-20 bg-white/90 backdrop-blur-sm flex flex-col items-center justify-center animate-fade-in">
                          <Loader2 className="h-8 w-8 text-primary animate-spin mb-3" />
                          <p className="text-sm text-muted-foreground font-medium">Connecting to transcription service...</p>
                        </div>
                      )}

                      {appState === APP_STATES.PAUSED && (
                        <div className="absolute inset-0 z-20 bg-white/60 backdrop-blur-[2px] flex flex-col items-center justify-center animate-fade-in">
                          <div className="bg-white px-8 py-6 rounded-2xl shadow-xl border border-border text-center transform transition-all scale-100">
                            <Pause className="h-10 w-10 text-primary mx-auto mb-3 bg-primary/10 p-2 rounded-full" />
                            <h3 className="font-semibold text-foreground text-lg">Transcript Paused</h3>
                            <p className="text-sm text-muted-foreground mt-1">Recording is temporarily paused</p>
                          </div>
                        </div>
                      )}

                      <ScrollArea className="flex-1 p-6">
                        <div className="space-y-6 pb-20">
                          {transcript.length === 0 && appState !== APP_STATES.CONNECTING && !isHistoryDetail && (
                            <div className="text-center text-muted-foreground py-20 flex flex-col items-center">
                              <div className="w-12 h-12 bg-secondary rounded-full flex items-center justify-center mb-3">
                                <Mic className="h-5 w-5 text-muted-foreground" />
                              </div>
                              <p>Start speaking to see transcript...</p>
                            </div>
                          )}
                          {transcript.map((line, idx) => (
                            <div key={idx} className="group flex gap-4 hover:bg-secondary/40 p-3 -mx-3 rounded-xl transition-all cursor-text">
                              <div className="w-14 shrink-0 text-xs text-muted-foreground pt-1 text-right font-mono opacity-40 group-hover:opacity-100 transition-opacity">{line.time}</div>
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <div className="text-xs font-semibold text-primary bg-primary/5 px-1.5 py-0.5 rounded">{line.speaker}</div>
                                </div>
                                <p className="text-[15px] leading-relaxed text-foreground/80 selection:bg-primary/20">{line.text}</p>
                              </div>
                            </div>
                          ))}
                          {/* Ghost element for auto-scroll */}
                          <div className="h-4" />
                        </div>
                      </ScrollArea>
                    </div>
                  )}
                </div>

                {/* Right Column: Editor */}
                {!showSummary && !isHistoryDetail && (
                  <div className={cn(
                    "flex flex-col transition-all duration-500",
                    appState === APP_STATES.IDLE ? "w-full" : "hidden lg:flex lg:w-1/2 lg:border-l lg:border-dashed lg:border-border lg:pl-8"
                  )}>
                    <div className="h-full relative group cursor-text p-1">
                      <div
                        className="w-full h-full outline-none text-lg leading-relaxed text-foreground/80 empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/40 placeholder-shown:text-muted-foreground"
                        contentEditable
                        suppressContentEditableWarning
                        data-placeholder={appState === APP_STATES.IDLE ? "Type here to take notes..." : "AI Notes will appear here after the call ends..."}
                      />
                    </div>
                  </div>
                )}

                {/* Summary Panel (Slide-in) */}
                {showSummary && (
                  <div className="lg:w-1/2 w-full bg-white rounded-2xl border border-border shadow-xl shadow-gray-200/50 flex flex-col animate-slide-in-right overflow-hidden relative">
                    <div className="p-4 border-b border-border flex items-center justify-between bg-gray-50/50">
                      <h3 className="font-semibold flex items-center text-primary"><PenTool className="h-4 w-4 mr-2" /> AI Summary</h3>
                      <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => setShowSummary(false)}><X className="h-4 w-4" /></Button>
                    </div>
                    <ScrollArea className="flex-1 p-6 bg-white/50">
                      <div className="space-y-8">
                        <section className="animate-fade-in" style={{ animationDelay: '0.1s' }}>
                          <SummaryRenderer content={summaryContent} />
                        </section>
                      </div>
                    </ScrollArea>
                    <div className="p-4 border-t border-border bg-gray-50/50 flex justify-end gap-2">
                      <Button variant="outline" size="sm" className="text-xs h-8 rounded-lg bg-white">Copy Text</Button>
                      <Button size="sm" className="text-xs h-8 rounded-lg bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20">Share Summary</Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto space-y-12">
              {groupMeetingsByDate(meetings).map(([date, items]) => (
                <div key={date} className="space-y-4">
                  <h3 className="text-sm font-medium text-muted-foreground/80 pl-2">{date}</h3>
                  <div className="space-y-3">
                    {items.map((m) => (
                      <div
                        key={m.id}
                        onClick={() => handleSelectMeeting(m.id)}
                        className="group bg-white p-6 rounded-2xl border border-border hover:border-primary/30 hover:shadow-md transition-all cursor-pointer flex items-center gap-5"
                      >
                        <div className="w-12 h-12 rounded-xl bg-gray-50 flex items-center justify-center group-hover:bg-primary/5 transition-colors">
                          <FileText className="h-6 w-6 text-muted-foreground group-hover:text-primary transition-colors" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-lg font-semibold text-foreground truncate group-hover:text-primary transition-colors">{m.title || "Untitled meeting"}</h4>
                          <p className="text-sm text-muted-foreground mt-1">Participants placeholder</p>
                        </div>
                        <div className="text-right">
                          <span className="text-sm text-muted-foreground font-medium uppercase tracking-tighter">
                            {new Date(m.created_on).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>

        {/* Bottom Floating Control Bar */}
        {currentView === 'recording' && appState !== APP_STATES.ERROR && (
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-30 max-w-[90vw]">
            <div className="bg-white/90 backdrop-blur-xl border border-border/50 shadow-2xl shadow-black/5 rounded-full p-1.5 flex items-center gap-2 pl-2 pr-2 ring-1 ring-black/5 transition-all hover:scale-[1.02] duration-300">

              {appState === APP_STATES.IDLE && !isHistoryDetail && (
                <Button
                  size="lg"
                  className="rounded-full px-8 bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/30 h-12 font-medium transition-all hover:shadow-primary/40"
                  onClick={handleStartRecording}
                >
                  <Mic className="h-5 w-5 mr-2" />
                  Start Recording
                </Button>
              )}

              {(appState === APP_STATES.IDLE && isHistoryDetail) && (
                <SummaryButton
                  onClick={handleGenerateSummary}
                  hasSummary={!!summaryContent}
                />
              )}

              {appState === APP_STATES.RECORDING && (
                <>
                  <Button
                    variant="outline"
                    size="icon"
                    className="rounded-full h-12 w-12 border-red-100 bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700 hover:border-red-200 transition-colors"
                    onClick={handleStopRecording}
                  >
                    <Square className="h-5 w-5 fill-current" />
                  </Button>

                  <Button
                    size="lg"
                    className="rounded-full px-8 h-12 min-w-[140px] bg-foreground text-background hover:bg-foreground/90 transition-all"
                    onClick={handlePauseRecording}
                  >
                    <Pause className="h-5 w-5 mr-2" /> Pause
                  </Button>
                </>
              )}

              {appState === APP_STATES.PAUSED && (
                <>
                  <Button
                    variant="outline"
                    size="icon"
                    className="rounded-full h-12 w-12 border-red-100 bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700 hover:border-red-200 transition-colors"
                    onClick={handleStopRecording}
                  >
                    <Square className="h-5 w-5 fill-current" />
                  </Button>

                  <Button
                    size="lg"
                    className="rounded-full px-8 h-12 min-w-[140px] bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20 transition-all font-medium"
                    onClick={handleResumeRecording}
                  >
                    <Play className="h-5 w-5 mr-2 fill-current" /> Resume
                  </Button>
                </>
              )}

              {appState === APP_STATES.STOPPED && (
                <SummaryButton
                  onClick={handleGenerateSummary}
                  hasSummary={!!summaryContent}
                  animate={true}
                />
              )}

              {appState !== APP_STATES.CONNECTING && appState !== APP_STATES.BUFFERING && (
                <>
                  <div className="h-8 w-px bg-border mx-1"></div>

                  <Button variant="ghost" size="sm" className="rounded-full text-muted-foreground hover:text-primary hover:bg-primary/5 h-10 px-4 transition-colors">
                    <MessageSquare className="h-4 w-4 mr-2" />
                    Ask AI
                  </Button>
                  <Button variant="ghost" size="sm" className="rounded-full text-muted-foreground hover:text-primary hover:bg-primary/5 h-10 px-4 transition-colors">
                    <Mail className="h-4 w-4 mr-2" />
                    Email
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Settings Modal */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="sm:max-w-[450px] p-0 gap-0 overflow-hidden rounded-2xl">
          <DialogHeader className="px-6 py-4 border-b border-border bg-gray-50/50">
            <DialogTitle>Settings</DialogTitle>
            <DialogDescription>Configure your audio and transcription preferences.</DialogDescription>
          </DialogHeader>
          <div className="p-6 space-y-6">
            <div className="space-y-4">
              <Label className="text-xs font-bold uppercase text-muted-foreground tracking-wider">Audio Format</Label>
              <RadioGroup defaultValue="opus" className="grid grid-cols-2 gap-4">
                <div className="flex items-center space-x-2 border border-border p-3 rounded-xl hover:bg-secondary/50 transition-colors cursor-pointer [&:has(:checked)]:border-primary [&:has(:checked)]:bg-primary/5">
                  <RadioGroupItem value="pcm" id="pcm" />
                  <div className="grid gap-1.5 leading-none">
                    <Label htmlFor="pcm" className="font-semibold cursor-pointer">PCM16</Label>
                    <p className="text-xs text-muted-foreground">Uncompressed (High Quality)</p>
                  </div>
                </div>
                <div className="flex items-center space-x-2 border border-border p-3 rounded-xl hover:bg-secondary/50 transition-colors cursor-pointer [&:has(:checked)]:border-primary [&:has(:checked)]:bg-primary/5">
                  <RadioGroupItem value="opus" id="opus" />
                  <div className="grid gap-1.5 leading-none">
                    <Label htmlFor="opus" className="font-semibold cursor-pointer">Opus</Label>
                    <p className="text-xs text-muted-foreground">Optimized (Low Bandwidth)</p>
                  </div>
                </div>
              </RadioGroup>
            </div>

            <div className="space-y-4">
              <Label className="text-xs font-bold uppercase text-muted-foreground tracking-wider">Sample Rate</Label>
              <Select defaultValue="16k">
                <SelectTrigger className="w-full h-11 rounded-xl">
                  <SelectValue placeholder="Select rate" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="16k">16 kHz (Speech Standard)</SelectItem>
                  <SelectItem value="32k">32 kHz (High Quality)</SelectItem>
                  <SelectItem value="48k">48 kHz (Studio)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-4">
              <Label className="text-xs font-bold uppercase text-muted-foreground tracking-wider">Loopback Audio</Label>
              <div className="bg-secondary/30 border border-border p-4 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="font-medium text-foreground flex items-center text-sm"><Volume2 className="h-4 w-4 mr-2 text-primary" /> macOS Instructions</div>
                  <Badge variant="outline" className="text-[10px]">Required</Badge>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  To capture system audio on macOS, you need to install <strong>BlackHole</strong> or use <strong>iShowU Audio Capture</strong>.
                </p>
                <Button variant="link" className="h-auto p-0 text-xs text-primary">View setup guide</Button>
              </div>
            </div>
          </div>
          <DialogFooter className="px-6 py-4 border-t border-border bg-gray-50/50">
            <Button variant="outline" onClick={() => setShowSettings(false)} className="rounded-lg">Cancel</Button>
            <Button onClick={() => setShowSettings(false)} className="rounded-lg bg-primary text-white hover:bg-primary/90">Save changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Logout Confirmation Dialog */}
      <Dialog open={showLogoutDialog} onOpenChange={setShowLogoutDialog}>
        <DialogContent className="sm:max-w-[400px] rounded-2xl p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              Sign Out
            </DialogTitle>
            <DialogDescription className="py-2 text-base">
              Are you sure you want to sign out? You'll need to sign in again to access your notes.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 sm:gap-0 mt-4">
            <Button
              variant="ghost"
              onClick={() => setShowLogoutDialog(false)}
              className="rounded-full flex-1 sm:flex-none"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleSignOut}
              className="rounded-full bg-red-600 hover:bg-red-700 flex-1 sm:flex-none"
            >
              Sign Out
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Toaster position="top-center" expand={true} richColors />
    </div>
  );
}
