'use client';

import { useEffect, useState, useCallback, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { 
  ArrowLeft, 
  RotateCcw, 
  CheckCircle2, 
  Sparkles, 
  Clock, 
  Eye, 
  EyeOff, 
  BookOpen, 
  Layers, 
  AlertCircle,
  Award,
  ChevronRight,
  Flame,
  Check,
  RefreshCw
} from 'lucide-react';
import { useAuth } from '../../../../context/AuthContext';
import { 
  fetchKitById, 
  fetchPracticeSession, 
  submitCardReview, 
  resetPracticeProgress 
} from '../../../../lib/api';

const CONFIDENCE_LEVELS = [
  {
    score: 1,
    label: 'Low / Again',
    desc: 'Uncertain, need to review soon',
    key: '1',
    bgColor: 'bg-rose-500/10 hover:bg-rose-500/20 border-rose-500/30 text-rose-300',
    activeColor: 'bg-rose-600 text-white'
  },
  {
    score: 2,
    label: 'Hard',
    desc: 'Recalled with notable effort',
    key: '2',
    bgColor: 'bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/30 text-amber-300',
    activeColor: 'bg-amber-600 text-white'
  },
  {
    score: 3,
    label: 'Good',
    desc: 'Recalled correctly with normal hesitation',
    key: '3',
    bgColor: 'bg-sky-500/10 hover:bg-sky-500/20 border-sky-500/30 text-sky-300',
    activeColor: 'bg-sky-600 text-white'
  },
  {
    score: 4,
    label: 'Easy',
    desc: 'Mastered, immediate confident recall',
    key: '4',
    bgColor: 'bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/30 text-emerald-300',
    activeColor: 'bg-emerald-600 text-white'
  }
];

export default function FlashcardPracticePage({ params }) {
  const resolvedParams = use(params);
  const kitId = resolvedParams.id;
  const router = useRouter();
  const { isAuthenticated, loading: authLoading } = useAuth();

  // State
  const [kit, setKit] = useState(null);
  const [deck, setDeck] = useState([]);
  const [summary, setSummary] = useState(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isRevealed, setIsRevealed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [filterMode, setFilterMode] = useState('ALL'); // 'ALL' | 'WEAK_ONLY' | 'UNCOVERED_ONLY'
  const [sessionCompleted, setSessionCompleted] = useState(false);
  const [sessionStats, setSessionStats] = useState({ reviewedInSession: 0, ratings: [] });

  // Load practice deck
  const loadPracticeDeck = useCallback(async (filter = filterMode) => {
    setLoading(true);
    setError(null);
    try {
      const [kitRes, practiceRes] = await Promise.all([
        fetchKitById(kitId),
        fetchPracticeSession(kitId, { filter: filter === 'ALL' ? undefined : filter })
      ]);

      setKit(kitRes.data.kit);
      setDeck(practiceRes.data.cards || []);
      setSummary(practiceRes.data.summary);
      setCurrentIndex(0);
      setIsRevealed(false);
      setSessionCompleted(false);
      setSessionStats({ reviewedInSession: 0, ratings: [] });
    } catch (err) {
      setError(err.message || 'Failed to load flashcard practice deck.');
    } finally {
      setLoading(false);
    }
  }, [kitId, filterMode]);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push(`/login?redirect=/kits/${kitId}/practice`);
    }
  }, [authLoading, isAuthenticated, router, kitId]);

  useEffect(() => {
    if (isAuthenticated && kitId) {
      loadPracticeDeck(filterMode);
    }
  }, [isAuthenticated, kitId, filterMode, loadPracticeDeck]);

  const currentCard = deck[currentIndex];

  // Submit Rating Handler
  const handleRateCard = useCallback(async (confidence) => {
    if (!currentCard || submitting) return;

    setSubmitting(true);
    try {
      const res = await submitCardReview(kitId, currentCard.id, { confidence });
      
      // Update local card and summary
      const updatedCard = res.data.card;
      setDeck(prev => prev.map(c => c.id === updatedCard.id ? updatedCard : c));
      if (res.data.summary) {
        setSummary(res.data.summary);
      }

      setSessionStats(prev => ({
        reviewedInSession: prev.reviewedInSession + 1,
        ratings: [...prev.ratings, { cardId: currentCard.id, confidence }]
      }));

      // Advance to next card or complete session
      if (currentIndex + 1 < deck.length) {
        setCurrentIndex(prev => prev + 1);
        setIsRevealed(false);
      } else {
        setSessionCompleted(true);
      }
    } catch (err) {
      setError(err.message || 'Failed to save card rating.');
    } finally {
      setSubmitting(false);
    }
  }, [currentCard, submitting, kitId, currentIndex, deck.length]);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't intercept if typing in an input
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;

      if (e.code === 'Space' || e.key === 'Enter') {
        e.preventDefault();
        setIsRevealed(prev => !prev);
      } else if (isRevealed && !submitting) {
        if (e.key === '1') handleRateCard(1);
        else if (e.key === '2') handleRateCard(2);
        else if (e.key === '3') handleRateCard(3);
        else if (e.key === '4') handleRateCard(4);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isRevealed, submitting, handleRateCard]);

  // Reset progress
  const handleResetProgress = async () => {
    if (!confirm('Are you sure you want to reset all flashcard review progress for this kit?')) return;
    try {
      setLoading(true);
      await resetPracticeProgress(kitId);
      await loadPracticeDeck(filterMode);
    } catch (err) {
      setError(err.message || 'Failed to reset progress.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-950 text-white flex flex-col items-center justify-center p-6">
        <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-neutral-400 font-medium text-sm">Preparing confidence-weighted practice session...</p>
      </div>
    );
  }

  if (error && !deck.length) {
    return (
      <div className="min-h-screen bg-neutral-950 text-white flex flex-col items-center justify-center p-6">
        <div className="max-w-md w-full bg-neutral-900 border border-rose-900/40 p-6 rounded-2xl text-center">
          <AlertCircle className="w-10 h-10 text-rose-400 mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-rose-200 mb-2">Practice Mode Error</h2>
          <p className="text-sm text-neutral-400 mb-6">{error}</p>
          <Link
            href={`/kits/${kitId}`}
            className="inline-flex items-center gap-2 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-sm font-medium rounded-xl transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Prep Kit
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-white flex flex-col">
      {/* Top Header */}
      <header className="border-b border-neutral-800 bg-neutral-900/60 backdrop-blur-md sticky top-0 z-30 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link
              href={`/kits/${kitId}`}
              className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-xl transition-colors"
              title="Return to Kit Builder"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-indigo-400">Practice Mode</span>
                <span className="text-neutral-600">•</span>
                <span className="text-xs text-neutral-400 font-medium">{kit?.targetRole} at {kit?.targetCompany}</span>
              </div>
              <h1 className="text-lg font-bold text-white flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-indigo-400" />
                Confidence-Weighted Flashcards
              </h1>
            </div>
          </div>

          {/* Quick Deck Stats / Covered pill */}
          <div className="flex items-center gap-3">
            {summary && (
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-neutral-800/80 border border-neutral-700 rounded-full text-xs">
                <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-neutral-300 font-medium">
                  {summary.coveredCount} of {summary.totalCards} Covered ({summary.coveragePercent}%)
                </span>
              </div>
            )}

            {/* Scope Filter Buttons */}
            <div className="flex bg-neutral-800/90 p-1 rounded-xl border border-neutral-700 text-xs">
              <button
                onClick={() => setFilterMode('ALL')}
                className={`px-3 py-1 rounded-lg font-medium transition-colors ${
                  filterMode === 'ALL' ? 'bg-indigo-600 text-white' : 'text-neutral-400 hover:text-white'
                }`}
              >
                All Cards
              </button>
              <button
                onClick={() => setFilterMode('WEAK_ONLY')}
                className={`px-3 py-1 rounded-lg font-medium transition-colors ${
                  filterMode === 'WEAK_ONLY' ? 'bg-amber-600 text-white' : 'text-neutral-400 hover:text-white'
                }`}
                title="Cards rated Low/Hard or Uncovered"
              >
                Weak / Due
              </button>
              <button
                onClick={() => setFilterMode('UNCOVERED_ONLY')}
                className={`px-3 py-1 rounded-lg font-medium transition-colors ${
                  filterMode === 'UNCOVERED_ONLY' ? 'bg-sky-600 text-white' : 'text-neutral-400 hover:text-white'
                }`}
                title="Unreviewed cards only"
              >
                Uncovered
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Practice Container */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-6 flex flex-col justify-center">
        {deck.length === 0 ? (
          <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-10 text-center max-w-lg mx-auto">
            <Layers className="w-12 h-12 text-neutral-600 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-white mb-2">No Flashcards in this View</h2>
            <p className="text-sm text-neutral-400 mb-6">
              {filterMode === 'UNCOVERED_ONLY'
                ? 'All cards have already been covered at least once! Switch to All Cards to review again.'
                : filterMode === 'WEAK_ONLY'
                ? 'No low or hard cards currently due. Great job maintaining mastery!'
                : 'No flashcards exist in this kit yet.'}
            </p>
            <div className="flex justify-center gap-3">
              <button
                onClick={() => setFilterMode('ALL')}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-xl transition-colors"
              >
                Show All Cards
              </button>
              <Link
                href={`/kits/${kitId}`}
                className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-sm font-medium rounded-xl transition-colors"
              >
                Return to Kit
              </Link>
            </div>
          </div>
        ) : sessionCompleted ? (
          /* Session Completion Screen */
          <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-8 sm:p-12 text-center max-w-xl mx-auto shadow-2xl animate-fade-in">
            <div className="w-16 h-16 bg-gradient-to-tr from-indigo-500 to-emerald-400 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-indigo-500/20">
              <Award className="w-8 h-8 text-neutral-950 font-bold" />
            </div>

            <h2 className="text-2xl font-black text-white mb-2">Session Complete!</h2>
            <p className="text-neutral-400 text-sm mb-8">
              You reviewed {sessionStats.reviewedInSession} flashcard{sessionStats.reviewedInSession === 1 ? '' : 's'}. Low-confidence cards will automatically be prioritized in your next session.
            </p>

            {/* Overall Deck Progress Card */}
            {summary && (
              <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-5 mb-8 text-left">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Overall Deck Coverage</span>
                  <span className="text-sm font-bold text-emerald-400">{summary.coveragePercent}%</span>
                </div>
                <div className="w-full bg-neutral-800 h-2.5 rounded-full overflow-hidden mb-4">
                  <div 
                    className="bg-gradient-to-r from-indigo-500 to-emerald-400 h-full transition-all duration-500 rounded-full"
                    style={{ width: `${summary.coveragePercent}%` }}
                  />
                </div>

                <div className="grid grid-cols-4 gap-2 pt-2 border-t border-neutral-800/80 text-center">
                  <div className="p-2 bg-rose-500/10 border border-rose-500/20 rounded-xl">
                    <span className="block text-xs font-medium text-rose-300">Low</span>
                    <span className="text-base font-bold text-rose-400">{summary.confidenceCounts.low}</span>
                  </div>
                  <div className="p-2 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                    <span className="block text-xs font-medium text-amber-300">Hard</span>
                    <span className="text-base font-bold text-amber-400">{summary.confidenceCounts.hard}</span>
                  </div>
                  <div className="p-2 bg-sky-500/10 border border-sky-500/20 rounded-xl">
                    <span className="block text-xs font-medium text-sky-300">Good</span>
                    <span className="text-base font-bold text-sky-400">{summary.confidenceCounts.medium}</span>
                  </div>
                  <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                    <span className="block text-xs font-medium text-emerald-300">Easy</span>
                    <span className="text-base font-bold text-emerald-400">{summary.confidenceCounts.high}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                onClick={() => loadPracticeDeck(filterMode)}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-xl shadow-lg shadow-indigo-600/20 transition-all"
              >
                <RefreshCw className="w-4 h-4" /> Start Next Session
              </button>

              <button
                onClick={() => {
                  setFilterMode('WEAK_ONLY');
                  loadPracticeDeck('WEAK_ONLY');
                }}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-sm font-medium rounded-xl border border-neutral-700 transition-colors"
              >
                <Flame className="w-4 h-4 text-amber-400" /> Practice Weak Cards
              </button>

              <Link
                href={`/kits/${kitId}`}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-white text-sm font-medium rounded-xl border border-neutral-800 transition-colors"
              >
                Back to Kit
              </Link>
            </div>
          </div>
        ) : (
          /* Active Card Presentation: One Card at a Time */
          <div className="flex flex-col gap-6">
            {/* Session Progress Header */}
            <div className="flex items-center justify-between text-xs text-neutral-400 px-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-white">Card {currentIndex + 1} of {deck.length}</span>
                <span className="text-neutral-600">•</span>
                <span className="capitalize">{currentCard?.category?.toLowerCase() || 'General'}</span>
                {currentCard?.targetRequirementId && (
                  <span className="px-2 py-0.5 bg-neutral-800 text-neutral-300 font-mono text-[10px] rounded-md">
                    {currentCard.targetRequirementId}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1.5">
                  {currentCard?.isCovered ? (
                    <span className="inline-flex items-center gap-1 text-emerald-400">
                      <Check className="w-3.5 h-3.5" /> Covered (Review #{currentCard.reviewCount})
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-sky-400">
                      <Sparkles className="w-3.5 h-3.5" /> New / Uncovered
                    </span>
                  )}
                </span>
              </div>
            </div>

            {/* Visual Step Progress Bar */}
            <div className="w-full bg-neutral-800/80 h-1.5 rounded-full overflow-hidden">
              <div 
                className="bg-indigo-500 h-full transition-all duration-300 rounded-full"
                style={{ width: `${((currentIndex) / deck.length) * 100}%` }}
              />
            </div>

            {/* 3D Flashcard Presentation */}
            <div 
              className={`min-h-[380px] bg-neutral-900 border rounded-3xl p-8 sm:p-10 flex flex-col justify-between transition-all duration-300 shadow-xl relative overflow-hidden ${
                isRevealed 
                  ? 'border-indigo-500/50 shadow-indigo-500/10' 
                  : 'border-neutral-800 hover:border-neutral-700'
              }`}
            >
              {/* Card Status Badges */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 bg-neutral-800 text-neutral-300 text-xs font-semibold rounded-lg">
                    {currentCard?.category || 'FLASHCARD'}
                  </span>
                  {currentCard?.confidence && (
                    <span className={`px-2 py-0.5 rounded-md text-[11px] font-medium ${
                      currentCard.confidence === 1 ? 'bg-rose-500/20 text-rose-300' :
                      currentCard.confidence === 2 ? 'bg-amber-500/20 text-amber-300' :
                      currentCard.confidence === 3 ? 'bg-sky-500/20 text-sky-300' :
                      'bg-emerald-500/20 text-emerald-300'
                    }`}>
                      Prior Confidence: {
                        currentCard.confidence === 1 ? 'Low (Needs Review)' :
                        currentCard.confidence === 2 ? 'Hard' :
                        currentCard.confidence === 3 ? 'Good' : 'Easy'
                      }
                    </span>
                  )}
                </div>

                <div className="text-xs text-neutral-500 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  {currentCard?.lastReviewedAt 
                    ? `Last seen: ${new Date(currentCard.lastReviewedAt).toLocaleDateString()}`
                    : 'Not yet reviewed'}
                </div>
              </div>

              {/* Card Prompt / Question */}
              <div className="my-auto py-4">
                <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider block mb-2">Prompt / Concept</span>
                <h3 className="text-xl sm:text-2xl font-bold text-white leading-relaxed">
                  {currentCard?.frontPrompt}
                </h3>

                {/* Answer Outline (Revealed State) */}
                {isRevealed && (
                  <div className="mt-6 pt-6 border-t border-neutral-800 animate-fade-in space-y-4">
                    <div>
                      <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider block mb-2">Key Talking Points</span>
                      {currentCard?.backKeyPoints?.length > 0 ? (
                        <ul className="space-y-2">
                          {currentCard.backKeyPoints.map((pt, idx) => (
                            <li key={idx} className="flex items-start gap-2.5 text-sm text-neutral-200">
                              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                              <span>{pt}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-neutral-400 italic">No key points specified.</p>
                      )}
                    </div>

                    {currentCard?.quickTip && (
                      <div className="p-3 bg-indigo-950/40 border border-indigo-500/30 rounded-xl text-xs text-indigo-200 flex items-start gap-2">
                        <Sparkles className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                        <div>
                          <strong className="font-semibold text-indigo-300">Quick Tip / Mnemonic: </strong>
                          {currentCard.quickTip}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Reveal Action (When Front View) */}
              {!isRevealed && (
                <div className="pt-6 border-t border-neutral-800/80 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <span className="text-xs text-neutral-500 flex items-center gap-1.5">
                    Press <kbd className="px-2 py-0.5 bg-neutral-800 rounded border border-neutral-700 text-neutral-300 font-mono text-[11px]">Space</kbd> or <kbd className="px-2 py-0.5 bg-neutral-800 rounded border border-neutral-700 text-neutral-300 font-mono text-[11px]">Enter</kbd> to reveal answer
                  </span>
                  <button
                    onClick={() => setIsRevealed(true)}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm rounded-xl shadow-lg shadow-indigo-600/20 transition-colors"
                  >
                    <Eye className="w-4 h-4" /> Reveal Answer
                  </button>
                </div>
              )}

              {/* Confidence Selection (When Revealed) */}
              {isRevealed && (
                <div className="pt-6 border-t border-neutral-800 animate-fade-in">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                      Rate Your Recall Confidence
                    </span>
                    <span className="text-xs text-neutral-500">
                      Press keys <kbd className="px-1.5 py-0.5 bg-neutral-800 rounded text-neutral-300 font-mono">1</kbd>–<kbd className="px-1.5 py-0.5 bg-neutral-800 rounded text-neutral-300 font-mono">4</kbd>
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    {CONFIDENCE_LEVELS.map((lvl) => (
                      <button
                        key={lvl.score}
                        disabled={submitting}
                        onClick={() => handleRateCard(lvl.score)}
                        className={`p-3 rounded-2xl border flex flex-col items-center justify-center text-center transition-all ${lvl.bgColor} ${
                          submitting ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer active:scale-95'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="text-xs px-1.5 py-0.2 bg-neutral-900/60 rounded font-mono font-bold">
                            {lvl.key}
                          </span>
                          <span className="text-sm font-bold">{lvl.label}</span>
                        </div>
                        <span className="text-[11px] opacity-80 line-clamp-1">{lvl.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Utility Bar */}
            <div className="flex items-center justify-between text-xs text-neutral-500 px-2">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setIsRevealed(prev => !prev)}
                  className="hover:text-neutral-300 flex items-center gap-1 transition-colors"
                >
                  {isRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  {isRevealed ? 'Hide Answer' : 'Show Answer'}
                </button>
                <button
                  onClick={handleResetProgress}
                  className="hover:text-rose-400 flex items-center gap-1 transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Reset Deck Progress
                </button>
              </div>

              {currentIndex > 0 && (
                <button
                  onClick={() => {
                    setCurrentIndex(prev => Math.max(0, prev - 1));
                    setIsRevealed(false);
                  }}
                  className="hover:text-neutral-300 transition-colors"
                >
                  Previous Card
                </button>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
