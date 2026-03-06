import { ApplicationConfig, importProvidersFrom } from '@angular/core';
import { provideRouter, withViewTransitions } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { errorInterceptor } from './core/interceptors/error.interceptor';
import {
  LucideAngularModule,
  // Navigation & Layout
  LayoutDashboard, Palette, Clapperboard, Video, VideoOff, Brain, BarChart2, BarChart3,
  MessageSquare, FileText, Megaphone, Image, FolderOpen, Bookmark,
  Gauge, GitBranch, Shield, Workflow, Settings, ChevronLeft, ChevronDown,
  ChevronRight, PanelLeft, Menu, X, MoreVertical, ExternalLink,
  // Actions
  Search, Bell, Calendar, Plus, Filter, Check, Copy, Trash2, PenLine,
  Download, Upload, Send, RefreshCw, RotateCcw, Play, Pause,
  // Status & Info
  AlertCircle, AlertTriangle, CheckCircle2, Info, Crown, Sparkles,
  TrendingUp, TrendingDown, ArrowRight, ArrowLeft,
  // Objects
  Zap, Eye, Music, Target, Activity, Clock, Lightbulb, Lock,
  CreditCard, User, Users, Globe, Smartphone, ShoppingCart,
  Camera, Package, Layers, Star, Heart, Mail, KeyRound,
  Building2, MonitorPlay, Wand2, Bot, Briefcase, DollarSign,
  BellRing, FileUp, LayoutGrid, List, CircleDot,
  CheckCircle, ClipboardList, IndianRupee, MapPin, Scan, XCircle,
  Rocket, Film, Mic, ShoppingBag, Columns, Link, ImageOff, LayoutTemplate
} from 'lucide-angular';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes, withViewTransitions()),
    provideHttpClient(
      withInterceptors([authInterceptor, errorInterceptor])
    ),
    importProvidersFrom(
      LucideAngularModule.pick({
        // Navigation & Layout
        LayoutDashboard, Palette, Clapperboard, Video, VideoOff, Brain, BarChart2, BarChart3,
        MessageSquare, FileText, Megaphone, Image, FolderOpen, Bookmark,
        Gauge, GitBranch, Shield, Workflow, Settings, ChevronLeft, ChevronDown,
        ChevronRight, PanelLeft, Menu, X, MoreVertical, ExternalLink,
        // Actions
        Search, Bell, Calendar, Plus, Filter, Check, Copy, Trash2, PenLine,
        Download, Upload, Send, RefreshCw, RotateCcw, Play, Pause,
        // Status & Info
        AlertCircle, AlertTriangle, CheckCircle2, Info, Crown, Sparkles,
        TrendingUp, TrendingDown, ArrowRight, ArrowLeft,
        // Objects
        Zap, Eye, Music, Target, Activity, Clock, Lightbulb, Lock,
        CreditCard, User, Users, Globe, Smartphone, ShoppingCart,
        Camera, Package, Layers, Star, Heart, Mail, KeyRound,
        Building2, MonitorPlay, Wand2, Bot, Briefcase, DollarSign,
        BellRing, FileUp, LayoutGrid, List, CircleDot,
        CheckCircle, ClipboardList, IndianRupee, MapPin, Scan, XCircle,
        Rocket, Film, Mic, ShoppingBag, Columns, Link, ImageOff, LayoutTemplate
      })
    ),
  ]
};
