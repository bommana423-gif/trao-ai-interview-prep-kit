'use client';

import { useEffect, useState, useCallback, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { 
  Building2, 
  Briefcase, 
  Calendar, 
  Sparkles, 
  Clock, 
  Pin, 
  PinOff, 
  Trash2, 
  Edit3, 
  Plus, 
  MoveUp, 
  MoveDown, 
  RotateCcw, 
  Check, 
  Layers, 
  AlertCircle, 
  CheckCircle2, 
  ChevronDown, 
  ChevronUp, 
  ArrowLeft,
  Loader2,
  BookOpen
} from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { 
  fetchKitById, 
  updateKit, 
  addQuestion, 
  updateQuestion, 
  deleteQuestion, 
  reorderQuestions, 
  addFlashcard, 
  updateFlashcard, 
  deleteFlashcard, 
  regenerateKitSection, 
  generateSchedule 
} from '../../../lib/api';

export default function KitDetailPage({ params }) {
  const resolvedParams = use(params);
  const kitId = resolvedParams.id;
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const [kit, setKit] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('questions'); // 'questions' | 'brief' | 'requirements' | 'flashcards' | 'schedule'
  const [actionLoading, setActionLoading] = useState(false);
  const [notification, setNotification] = useState(null);

  // New question form state
  const [showAddQuestion, setShowAddQuestion] = useState(false);
  const [newQuestionData, setNewQuestionData] = useState({
    prompt: '',
    category: 'TECHNICAL',
    difficulty: 'MID',
    estimatedMinutes: 20,
    competencyIds: []
  });

  // Schedule days input
  const [scheduleDaysInput, setScheduleDaysInput] = useState(7);

  // Auth Protection
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push(`/login?redirect=/kits/${kitId}`);
    }
  }, [authLoading, isAuthenticated, router, kitId]);

  const loadKit = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchKitById(kitId);
      const loadedKit = res.data.kit;
      setKit(loadedKit);
      if (loadedKit.schedule?.length) {
        setScheduleDaysInput(loadedKit.schedule.length);
      }
    } catch (err) {
      setError(err.message || 'Failed to load prep kit.');
    } finally {
      setLoading(false);
    }
  }, [kitId]);

  // Load Kit Data
  useEffect(() => {
    if (isAuthenticated && kitId) {
      loadKit();
    }
  }, [isAuthenticated, kitId, loadKit]);

  const showToast = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };

  // ==========================================
  // QUESTION ACTIONS
  // ==========================================

  const handleTogglePinQuestion = async (q) => {
    const newPinState = !q.isPinned;
    // Optimistic local update
    setKit(prev => {
      const updated = { ...prev };
      updated.modules.forEach(m => {
        m.questions.forEach(item => {
          if ((item.questionId || item.id) === (q.questionId || q.id)) {
            item.isPinned = newPinState;
          }
        });
      });
      return updated;
    });

    try {
      const qId = q.questionId || q.id;
      const res = await updateQuestion(kitId, qId, { isPinned: newPinState });
      showToast(newPinState ? 'Question pinned (protected from regeneration)' : 'Question unpinned');
      if (res.data?.version) {
        setKit(prev => ({ ...prev, version: res.data.version }));
      }
    } catch (err) {
      showToast(err.message, 'error');
      loadKit();
    }
  };

  const handleDeleteQuestion = async (qId) => {
    if (!confirm('Are you sure you want to delete this question?')) return;

    // Optimistic delete
    setKit(prev => {
      const updated = { ...prev };
      updated.modules.forEach(m => {
        m.questions = m.questions.filter(item => (item.questionId || item.id) !== qId);
      });
      return updated;
    });

    try {
      const res = await deleteQuestion(kitId, qId);
      showToast('Question deleted');
      if (res.data?.coverageScore !== undefined) {
        setKit(prev => ({ 
          ...prev, 
          coverageScore: res.data.coverageScore,
          version: res.data.version 
        }));
      }
    } catch (err) {
      showToast(err.message, 'error');
      loadKit();
    }
  };

  const handleCreateQuestion = async (e) => {
    e.preventDefault();
    if (!newQuestionData.prompt.trim()) return;

    setActionLoading(true);
    try {
      const res = await addQuestion(kitId, newQuestionData);
      showToast('Custom question added');
      setShowAddQuestion(false);
      setNewQuestionData({
        prompt: '',
        category: 'TECHNICAL',
        difficulty: 'MID',
        estimatedMinutes: 20,
        competencyIds: []
      });
      loadKit();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleMoveCategory = async (q, newCategory) => {
    const qId = q.questionId || q.id;
    try {
      await updateQuestion(kitId, qId, { category: newCategory });
      showToast(`Question moved to ${newCategory}`);
      loadKit();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleReorder = async (moduleId, direction, qIndex) => {
    const targetModule = kit.modules.find(m => m.moduleId === moduleId || m.type === moduleId);
    if (!targetModule) return;

    const questions = [...targetModule.questions];
    const targetIdx = direction === 'up' ? qIndex - 1 : qIndex + 1;
    if (targetIdx < 0 || targetIdx >= questions.length) return;

    // Swap
    const temp = questions[qIndex];
    questions[qIndex] = questions[targetIdx];
    questions[targetIdx] = temp;

    const orderedIds = questions.map(q => q.questionId || q.id);

    // Optimistic update
    setKit(prev => {
      const updated = { ...prev };
      const mod = updated.modules.find(m => m.moduleId === moduleId || m.type === moduleId);
      if (mod) mod.questions = questions;
      return updated;
    });

    try {
      await reorderQuestions(kitId, moduleId, orderedIds);
    } catch (err) {
      showToast(err.message, 'error');
      loadKit();
    }
  };

  // ==========================================
  // TARGETED REGENERATION ACTIONS
  // ==========================================

  const handleRegenerateCategory = async (category) => {
    if (!confirm(`Regenerate ${category} questions? Pinned and user-edited questions will be preserved.`)) return;

    setActionLoading(true);
    try {
      const res = await regenerateKitSection(kitId, {
        section: 'CATEGORY_QUESTIONS',
        category
      });
      showToast(`${category} questions regenerated (${res.data.preservedCount} preserved, ${res.data.newlyGeneratedCount} fresh)`);
      loadKit();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRegenerateBrief = async () => {
    if (!confirm('Regenerate Company Brief? Questions and schedule will remain untouched.')) return;

    setActionLoading(true);
    try {
      await regenerateKitSection(kitId, { section: 'COMPANY_BRIEF' });
      showToast('Company Brief regenerated');
      loadKit();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRegenerateSchedule = async () => {
    const days = parseInt(scheduleDaysInput, 10);
    if (isNaN(days) || days < 1 || days > 60) {
      showToast('Please enter a valid schedule duration between 1 and 60 days', 'error');
      return;
    }

    setActionLoading(true);
    try {
      await generateSchedule(kitId, days);
      showToast(`Deterministic study schedule regenerated for ${days} days`);
      loadKit();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading || authLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
          <p className="text-xs text-slate-500 font-medium">Loading prep kit workspace...</p>
        </div>
      </div>
    );
  }

  if (error || !kit) {
    return (
      <div className="mx-auto max-w-4xl py-12 px-4">
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <AlertCircle className="mx-auto h-8 w-8 text-red-600 mb-2" />
          <h2 className="text-base font-semibold text-red-900">Unable to load Prep Kit</h2>
          <p className="text-xs text-red-700 mt-1">{error || 'Kit not found or access denied.'}</p>
          <Link href="/kits" className="inline-block mt-4 text-xs font-semibold text-brand-600 hover:underline">
            &larr; Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const allQuestions = [];
  (kit.modules || []).forEach(m => {
    (m.questions || []).forEach(q => allQuestions.push({ ...q, moduleType: m.type }));
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Toast Notification */}
      {notification && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-lg px-4 py-3 shadow-lg text-xs font-medium ${
          notification.type === 'error' ? 'bg-red-600 text-white' : 'bg-slate-900 text-white'
        }`}>
          {notification.type === 'error' ? <AlertCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
          {notification.message}
        </div>
      )}

      {/* Header & Back Navigation */}
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <Link href="/kits" className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 mb-2">
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Kits Dashboard
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{kit.targetRole}</h1>
            <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
              v{kit.version || 1}
            </span>
            <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
              {kit.status || 'READY'}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-4 text-xs text-slate-600">
            <span className="flex items-center gap-1 font-medium">
              <Building2 className="h-3.5 w-3.5 text-slate-400" />
              {kit.targetCompany}
            </span>
            <span className="flex items-center gap-1">
              <Layers className="h-3.5 w-3.5 text-slate-400" />
              Coverage: <strong className="text-brand-600 font-semibold">{kit.coverageScore || 0}%</strong>
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5 text-slate-400" />
              {kit.schedule?.length || 0} Day Study Plan
            </span>
          </div>
        </div>

        {/* Global Action Controls */}
        <div className="flex items-center gap-2.5">
          <Link
            href={`/kits/${kitId}/practice`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 transition"
          >
            <BookOpen className="h-4 w-4" />
            Practice Flashcards
          </Link>
          <button
            onClick={() => setShowAddQuestion(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-brand-700 transition"
          >
            <Plus className="h-4 w-4" />
            Add Custom Question
          </button>
        </div>
      </div>

      {/* Honest Limitation Banner for Sparse Job Descriptions */}
      {kit.isSparseJd && (
        <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50/90 p-4 text-xs text-amber-900 shadow-xs flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-semibold block">Honest Assessment Notice: Sparse Job Description</span>
            <p className="text-amber-800 leading-relaxed">
              {kit.insufficientInfoNotes || 'The provided job description contained minimal concrete technical requirements. The system preserved this limitation honestly and avoided hallucinating missing competencies.'}
            </p>
          </div>
        </div>
      )}

      {/* Tab Navigation (Responsive Horizontal Scroll) */}
      <div className="mb-8 border-b border-slate-200 overflow-x-auto pb-px">
        <nav className="flex space-x-6 min-w-max">
          {[
            { id: 'questions', label: `Questions (${allQuestions.length})`, icon: Layers },
            { id: 'brief', label: 'Company Intelligence', icon: Building2 },
            { id: 'requirements', label: `Requirements (${kit.requirements?.length || 0})`, icon: Briefcase },
            { id: 'flashcards', label: `Flashcards (${kit.flashcards?.length || 0})`, icon: BookOpen },
            { id: 'schedule', label: `Study Schedule (${kit.schedule?.length || 0}d)`, icon: Calendar }
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 py-3 border-b-2 text-xs font-semibold transition ${
                  isActive 
                    ? 'border-brand-600 text-brand-600' 
                    : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: QUESTIONS & MODULES BUILDER                                        */}
      {/* ========================================================================= */}
      {activeTab === 'questions' && (
        <div className="space-y-8">
          {/* Add Question Inline Modal / Form */}
          {showAddQuestion && (
            <div className="rounded-xl border border-brand-200 bg-brand-50/50 p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-brand-900 flex items-center gap-1.5">
                  <Plus className="h-4 w-4 text-brand-600" />
                  Add Custom Interview Question
                </h3>
                <button 
                  onClick={() => setShowAddQuestion(false)}
                  className="text-xs text-slate-400 hover:text-slate-600"
                >
                  Cancel
                </button>
              </div>

              <form onSubmit={handleCreateQuestion} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Question Prompt / Problem Statement *
                  </label>
                  <textarea
                    rows={2}
                    required
                    value={newQuestionData.prompt}
                    onChange={e => setNewQuestionData({ ...newQuestionData, prompt: e.target.value })}
                    placeholder="e.g. How do you design an idempotent payment webhook receiver?"
                    className="w-full rounded-lg border border-slate-300 p-2.5 text-xs text-slate-900 shadow-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Category</label>
                    <select
                      value={newQuestionData.category}
                      onChange={e => setNewQuestionData({ ...newQuestionData, category: e.target.value })}
                      className="w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-900 shadow-sm"
                    >
                      <option value="TECHNICAL">Technical Deep Dive</option>
                      <option value="SYSTEM_DESIGN">System Design & Architecture</option>
                      <option value="BEHAVIORAL">Behavioral & Leadership</option>
                      <option value="COMPANY_SPECIFIC">Company Alignment</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Difficulty</label>
                    <select
                      value={newQuestionData.difficulty}
                      onChange={e => setNewQuestionData({ ...newQuestionData, difficulty: e.target.value })}
                      className="w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-900 shadow-sm"
                    >
                      <option value="ENTRY">Entry</option>
                      <option value="MID">Mid</option>
                      <option value="SENIOR">Senior</option>
                      <option value="STAFF">Staff</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Estimated Minutes</label>
                    <input
                      type="number"
                      min={5}
                      max={60}
                      value={newQuestionData.estimatedMinutes}
                      onChange={e => setNewQuestionData({ ...newQuestionData, estimatedMinutes: parseInt(e.target.value, 10) })}
                      className="w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-900 shadow-sm"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAddQuestion(false)}
                    className="rounded-lg border border-slate-300 px-3.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={actionLoading}
                    className="rounded-lg bg-brand-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-brand-700 transition"
                  >
                    Save Custom Question
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Module Categories */}
          {(kit.modules || []).map(moduleItem => (
            <div key={moduleItem.moduleId} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-slate-100 gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-slate-900">{moduleItem.title}</h2>
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-2xs font-semibold text-slate-600">
                      {moduleItem.type}
                    </span>
                    <span className="text-xs text-slate-500 font-medium">
                      ({moduleItem.questions?.length || 0} questions)
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleRegenerateCategory(moduleItem.type)}
                    disabled={actionLoading}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-2xs"
                    title="Regenerates fresh questions for this category while strictly preserving pinned and user-edited questions."
                  >
                    <RotateCcw className="h-3.5 w-3.5 text-brand-600" />
                    Regenerate Category
                  </button>
                </div>
              </div>

              {/* Questions List */}
              <div className="mt-4 space-y-4">
                {(moduleItem.questions || []).length === 0 ? (
                  <p className="text-xs text-slate-400 italic py-3 text-center">
                    No questions in this category. Click &quot;Add Custom Question&quot; or &quot;Regenerate Category&quot;.
                  </p>
                ) : (
                  moduleItem.questions.map((q, qIndex) => (
                    <QuestionCard
                      key={q.questionId || q.id}
                      question={q}
                      qIndex={qIndex}
                      totalInModule={moduleItem.questions.length}
                      moduleId={moduleItem.moduleId}
                      onTogglePin={() => handleTogglePinQuestion(q)}
                      onDelete={() => handleDeleteQuestion(q.questionId || q.id)}
                      onMoveUp={() => handleReorder(moduleItem.moduleId, 'up', qIndex)}
                      onMoveDown={() => handleReorder(moduleItem.moduleId, 'down', qIndex)}
                      onMoveCategory={(newCat) => handleMoveCategory(q, newCat)}
                      onSaveEdit={async (updates) => {
                        try {
                          await updateQuestion(kitId, q.questionId || q.id, updates);
                          showToast('Question updated');
                          loadKit();
                        } catch (err) {
                          showToast(err.message, 'error');
                        }
                      }}
                    />
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: COMPANY BRIEF                                                      */}
      {/* ========================================================================= */}
      {activeTab === 'brief' && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-base font-bold text-slate-900">Company Intelligence Brief</h2>
              <p className="text-xs text-slate-500">
                Synthesized insights from verified crawler sources. Modifying will mark content as customized.
              </p>
            </div>
            <button
              onClick={handleRegenerateBrief}
              disabled={actionLoading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-2xs"
            >
              <RotateCcw className="h-3.5 w-3.5 text-brand-600" />
              Regenerate Brief
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Company Overview</label>
              <textarea
                rows={3}
                defaultValue={kit.companyBrief?.overview || ''}
                onBlur={async (e) => {
                  if (e.target.value !== kit.companyBrief?.overview) {
                    await updateKit(kitId, { companyBrief: { ...kit.companyBrief, overview: e.target.value } });
                    showToast('Overview updated');
                  }
                }}
                className="w-full rounded-lg border border-slate-300 p-2.5 text-xs text-slate-900 shadow-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Tech Stack (comma separated)</label>
              <input
                type="text"
                defaultValue={(kit.companyBrief?.techStack || []).join(', ')}
                onBlur={async (e) => {
                  const arr = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
                  await updateKit(kitId, { companyBrief: { ...kit.companyBrief, techStack: arr } });
                  showToast('Tech stack updated');
                }}
                className="w-full rounded-lg border border-slate-300 p-2.5 text-xs text-slate-900 shadow-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Interview & Engineering Culture</label>
              <textarea
                rows={2}
                defaultValue={kit.companyBrief?.interviewCulture || ''}
                onBlur={async (e) => {
                  if (e.target.value !== kit.companyBrief?.interviewCulture) {
                    await updateKit(kitId, { companyBrief: { ...kit.companyBrief, interviewCulture: e.target.value } });
                    showToast('Culture notes updated');
                  }
                }}
                className="w-full rounded-lg border border-slate-300 p-2.5 text-xs text-slate-900 shadow-sm"
              />
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: ROLE & REQUIREMENTS                                                */}
      {/* ========================================================================= */}
      {activeTab === 'requirements' && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-base font-bold text-slate-900">Extracted Job Requirements</h2>
              <p className="text-xs text-slate-500">
                Atomic requirements mapped directly from the Job Description. Every question references these IDs.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700 border border-slate-200 rounded-lg">
              <thead className="bg-slate-50 text-slate-900 border-b border-slate-200">
                <tr>
                  <th className="p-3 font-semibold">ID</th>
                  <th className="p-3 font-semibold">Requirement Description</th>
                  <th className="p-3 font-semibold">Kind</th>
                  <th className="p-3 font-semibold">Priority</th>
                  <th className="p-3 font-semibold">Origin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {(kit.requirements || []).map(r => (
                  <tr key={r.id} className="hover:bg-slate-50/60">
                    <td className="p-3 font-mono font-medium text-slate-900">{r.id}</td>
                    <td className="p-3 font-medium text-slate-800">{r.text}</td>
                    <td className="p-3">
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-2xs font-semibold text-slate-700 uppercase">
                        {r.kind}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className={`rounded px-2 py-0.5 text-2xs font-semibold ${
                        r.priority === 'must-have' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {r.priority}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-3xs font-medium text-slate-500">
                        {r.origin || 'GENERATED'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: FLASHCARDS                                                         */}
      {/* ========================================================================= */}
      {activeTab === 'flashcards' && (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-slate-100 mb-6 gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-900">Revision Flashcards</h2>
                <p className="text-xs text-slate-500">
                  Rapid recall prompts linking to explicit technical competencies.
                </p>
              </div>
              <div className="flex items-center gap-2.5">
                <Link
                  href={`/kits/${kitId}/practice`}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 transition"
                >
                  <BookOpen className="h-3.5 w-3.5" />
                  Practice Deck
                </Link>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {(kit.flashcards || []).map(card => (
                <div key={card.id} className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 shadow-2xs flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1.5">
                        <span className="rounded bg-brand-50 px-2 py-0.5 text-3xs font-semibold text-brand-700 uppercase">
                          {card.category || 'CONCEPT'}
                        </span>
                        {card.confidence ? (
                          <span className={`rounded px-1.5 py-0.5 text-3xs font-semibold ${
                            card.confidence === 1 ? 'bg-rose-100 text-rose-700' :
                            card.confidence === 2 ? 'bg-amber-100 text-amber-700' :
                            card.confidence === 3 ? 'bg-sky-100 text-sky-700' :
                            'bg-emerald-100 text-emerald-700'
                          }`}>
                            {card.confidence === 1 ? 'Low' : card.confidence === 2 ? 'Hard' : card.confidence === 3 ? 'Good' : 'Easy'}
                          </span>
                        ) : (
                          <span className="rounded bg-slate-200 px-1.5 py-0.5 text-3xs font-medium text-slate-600">
                            Uncovered
                          </span>
                        )}
                      </div>
                      <button
                        onClick={async () => {
                          await deleteFlashcard(kitId, card.id);
                          showToast('Flashcard removed');
                          loadKit();
                        }}
                        className="text-slate-400 hover:text-red-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <h4 className="text-xs font-bold text-slate-900 mb-2">{card.frontPrompt}</h4>
                    <ul className="space-y-1 text-2xs text-slate-600 list-disc pl-3 mb-3">
                      {(card.backKeyPoints || []).map((pt, idx) => (
                        <li key={idx}>{pt}</li>
                      ))}
                    </ul>
                  </div>
                  {card.quickTip && (
                    <p className="text-3xs text-brand-700 bg-brand-50/80 rounded p-1.5 font-medium">
                      💡 <strong>Tip:</strong> {card.quickTip}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 5: DETERMINISTIC STUDY SCHEDULE                                       */}
      {/* ========================================================================= */}
      {activeTab === 'schedule' && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-slate-100 gap-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">Deterministic Study Schedule</h2>
              <p className="text-xs text-slate-500">
                Guaranteed coverage timeline front-loading must-have and harder competencies.
              </p>
            </div>

            {/* Schedule Day Selector Form */}
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-slate-700">Days (1 - 60):</label>
              <input
                type="number"
                min={1}
                max={60}
                value={scheduleDaysInput}
                onChange={e => setScheduleDaysInput(e.target.value)}
                className="w-16 rounded-lg border border-slate-300 p-1.5 text-xs text-slate-900 text-center font-bold"
              />
              <button
                onClick={handleRegenerateSchedule}
                disabled={actionLoading}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-brand-700 transition"
              >
                <Calendar className="h-3.5 w-3.5" />
                Allocate
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(kit.schedule || []).map(dayItem => (
              <div 
                key={dayItem.day}
                className={`rounded-lg border p-4 shadow-2xs ${
                  dayItem.isReviewDay ? 'border-purple-200 bg-purple-50/30' : 'border-slate-200 bg-white'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-bold text-xs text-slate-900">Day {dayItem.day}</span>
                  <span className="flex items-center gap-1 text-2xs text-slate-500">
                    <Clock className="h-3 w-3" />
                    {dayItem.allocatedMinutes} mins
                  </span>
                </div>
                <h4 className="text-xs font-semibold text-slate-800 mb-2">{dayItem.focus}</h4>
                <div className="text-2xs text-slate-500">
                  <p className="font-medium text-slate-600">Questions: {dayItem.question_ids?.length || 0}</p>
                  <p className="font-mono text-3xs text-slate-400 mt-1 truncate">
                    {(dayItem.question_ids || []).join(', ')}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Subcomponent for displaying an individual Question Card with full edit capability
 */
function QuestionCard({
  question,
  qIndex,
  totalInModule,
  moduleId,
  onTogglePin,
  onDelete,
  onMoveUp,
  onMoveDown,
  onMoveCategory,
  onSaveEdit
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [promptText, setPromptText] = useState(question.prompt || '');
  const [difficulty, setDifficulty] = useState(question.difficulty || 'MID');
  const [minutes, setMinutes] = useState(question.estimatedMinutes || 20);
  const [approach, setApproach] = useState(question.answerFramework?.approach || '');

  const qId = question.questionId || question.id;
  const origin = question.origin || 'GENERATED';
  const isPinned = Boolean(question.isPinned);

  const handleSave = () => {
    onSaveEdit({
      prompt: promptText,
      difficulty,
      estimatedMinutes: minutes,
      answerFramework: {
        ...question.answerFramework,
        approach
      }
    });
    setEditing(false);
  };

  return (
    <div className={`rounded-xl border p-4 transition shadow-2xs ${
      isPinned ? 'border-purple-200 bg-purple-50/20' : 'border-slate-200 bg-white'
    }`}>
      {/* Card Header: Metadata & Status Badges */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-3xs font-semibold text-slate-500">{qId}</span>
          
          {/* State Badge */}
          <span className={`rounded px-1.5 py-0.5 text-3xs font-bold uppercase ${
            origin === 'USER_CREATED'
              ? 'bg-emerald-100 text-emerald-800'
              : origin === 'USER_EDITED'
              ? 'bg-amber-100 text-amber-800'
              : 'bg-blue-100 text-blue-800'
          }`}>
            {origin === 'USER_CREATED' ? 'Custom' : origin === 'USER_EDITED' ? 'Edited' : 'Generated'}
          </span>

          {isPinned && (
            <span className="inline-flex items-center gap-1 rounded bg-purple-100 px-1.5 py-0.5 text-3xs font-bold text-purple-800">
              <Pin className="h-2.5 w-2.5" /> Pinned
            </span>
          )}

          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-3xs font-semibold text-slate-600">
            {difficulty}
          </span>
          <span className="text-3xs text-slate-500 font-medium">
            {minutes}m
          </span>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1 self-end sm:self-auto">
          {/* Pin / Unpin Button */}
          <button
            onClick={onTogglePin}
            title={isPinned ? 'Unpin question' : 'Pin question (protects from replacement)'}
            className={`p-1.5 rounded hover:bg-slate-100 transition ${
              isPinned ? 'text-purple-600' : 'text-slate-400 hover:text-slate-700'
            }`}
          >
            {isPinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
          </button>

          {/* Move Up / Down */}
          <button
            disabled={qIndex === 0}
            onClick={onMoveUp}
            className="p-1.5 rounded text-slate-400 hover:text-slate-700 disabled:opacity-30"
          >
            <MoveUp className="h-3.5 w-3.5" />
          </button>
          <button
            disabled={qIndex === totalInModule - 1}
            onClick={onMoveDown}
            className="p-1.5 rounded text-slate-400 hover:text-slate-700 disabled:opacity-30"
          >
            <MoveDown className="h-3.5 w-3.5" />
          </button>

          {/* Category Transfer Dropdown */}
          <select
            defaultValue={question.category}
            onChange={e => onMoveCategory(e.target.value)}
            className="text-3xs rounded border border-slate-200 p-1 text-slate-600"
          >
            <option value="TECHNICAL">Tech</option>
            <option value="SYSTEM_DESIGN">SysDesign</option>
            <option value="BEHAVIORAL">Behavior</option>
            <option value="COMPANY_SPECIFIC">Fit</option>
          </select>

          {/* Edit Toggle */}
          <button
            onClick={() => setEditing(!editing)}
            className="p-1.5 rounded text-slate-400 hover:text-slate-700"
          >
            <Edit3 className="h-3.5 w-3.5" />
          </button>

          {/* Delete Button */}
          <button
            onClick={onDelete}
            className="p-1.5 rounded text-slate-400 hover:text-red-600"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Main Question Body */}
      {editing ? (
        <div className="space-y-3 pt-2">
          <textarea
            rows={2}
            value={promptText}
            onChange={e => setPromptText(e.target.value)}
            className="w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-900"
          />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-3xs font-semibold text-slate-600 mb-0.5">Difficulty</label>
              <select
                value={difficulty}
                onChange={e => setDifficulty(e.target.value)}
                className="w-full rounded border border-slate-200 p-1 text-xs"
              >
                <option value="ENTRY">ENTRY</option>
                <option value="MID">MID</option>
                <option value="SENIOR">SENIOR</option>
                <option value="STAFF">STAFF</option>
              </select>
            </div>
            <div>
              <label className="block text-3xs font-semibold text-slate-600 mb-0.5">Estimated Minutes</label>
              <input
                type="number"
                value={minutes}
                onChange={e => setMinutes(parseInt(e.target.value, 10))}
                className="w-full rounded border border-slate-200 p-1 text-xs"
              />
            </div>
          </div>
          <div>
            <label className="block text-3xs font-semibold text-slate-600 mb-0.5">Answer Outline Approach</label>
            <input
              type="text"
              value={approach}
              onChange={e => setApproach(e.target.value)}
              className="w-full rounded border border-slate-200 p-1 text-xs"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setEditing(false)}
              className="rounded px-2.5 py-1 text-3xs font-medium text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="rounded bg-brand-600 px-3 py-1 text-3xs font-semibold text-white hover:bg-brand-700"
            >
              Save Changes
            </button>
          </div>
        </div>
      ) : (
        <div>
          <p className="text-xs font-semibold text-slate-900 leading-relaxed">{question.prompt}</p>

          {/* Target Requirement IDs */}
          {question.competencyIds?.length > 0 && (
            <div className="mt-2 flex items-center gap-1.5 flex-wrap">
              <span className="text-3xs text-slate-400 font-medium">Mapped:</span>
              {question.competencyIds.map(reqId => (
                <span key={reqId} className="rounded bg-slate-100 px-1.5 py-0.5 text-3xs font-mono font-medium text-slate-700">
                  {reqId}
                </span>
              ))}
            </div>
          )}

          {/* Expandable Framework & Rubric */}
          <div className="mt-3 pt-2 border-t border-slate-100">
            <button
              onClick={() => setExpanded(!expanded)}
              className="inline-flex items-center gap-1 text-3xs font-semibold text-slate-500 hover:text-slate-800"
            >
              {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {expanded ? 'Hide Answer Framework & Rubric' : 'View Answer Framework & Rubric'}
            </button>

            {expanded && (
              <div className="mt-3 space-y-2 rounded-lg bg-slate-50 p-3 text-2xs text-slate-700">
                {question.answerFramework?.approach && (
                  <div>
                    <strong className="text-slate-900 font-semibold">Approach: </strong>
                    {question.answerFramework.approach}
                  </div>
                )}
                {question.answerFramework?.keyPointsToCover?.length > 0 && (
                  <div>
                    <strong className="text-slate-900 font-semibold">Key Points: </strong>
                    <ul className="list-disc pl-4 mt-0.5">
                      {question.answerFramework.keyPointsToCover.map((pt, idx) => (
                        <li key={idx}>{pt}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {question.rubric?.criteria && (
                  <div className="pt-2 border-t border-slate-200">
                    <strong className="text-slate-900 font-semibold">Evaluation Rubric: </strong>
                    {question.rubric.criteria}
                    <div className="mt-1 space-y-1">
                      {question.rubric.level1Deficient && (
                        <p className="text-3xs text-red-700"><strong className="font-semibold">L1 (Deficient):</strong> {question.rubric.level1Deficient}</p>
                      )}
                      {question.rubric.level3Acceptable && (
                        <p className="text-3xs text-amber-700"><strong className="font-semibold">L3 (Acceptable):</strong> {question.rubric.level3Acceptable}</p>
                      )}
                      {question.rubric.level5Exceptional && (
                        <p className="text-3xs text-emerald-700"><strong className="font-semibold">L5 (Exceptional):</strong> {question.rubric.level5Exceptional}</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
