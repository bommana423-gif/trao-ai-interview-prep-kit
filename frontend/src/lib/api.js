/**
 * API Client utility for fetching from Trao Backend
 */
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api/v1';

export class ApiError extends Error {
  constructor(message, status = 500, details = null) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

/**
 * Standard fetch wrapper with error handling, credentials (cookies), and timeout
 */
export async function apiClient(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
  
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeout || 8000);

  try {
    const response = await fetch(url, {
      credentials: 'include', // Include HTTP-only session cookies automatically
      ...options,
      headers,
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    const contentType = response.headers.get('content-type');
    const isJson = contentType && contentType.includes('application/json');
    const data = isJson ? await response.json() : await response.text();

    if (!response.ok) {
      const errorMessage = (isJson && data.message) ? data.message : `HTTP Error ${response.status}: ${response.statusText}`;
      throw new ApiError(errorMessage, response.status, isJson ? data.details : null);
    }

    return data;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new ApiError('Request timed out. Please check if the backend service is running.', 408);
    }
    if (err instanceof ApiError) {
      throw err;
    }
    throw new ApiError(err.message || 'Network error occurred while contacting API', 503);
  }
}

// Health Probes
export async function checkBackendHealth() {
  return apiClient('/health');
}

// Authentication Helpers
export async function registerUser(email, password, name) {
  return apiClient('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, name })
  });
}

export async function loginUser(email, password) {
  return apiClient('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });
}

export async function logoutUser() {
  return apiClient('/auth/logout', {
    method: 'POST'
  });
}

export async function getCurrentUser() {
  return apiClient('/auth/me');
}

// Kit Management Helpers (Protected & User-Isolated)
export async function fetchMyKits() {
  return apiClient('/kits');
}

export async function fetchKitById(id) {
  return apiClient(`/kits/${id}`);
}

export async function createKit(kitData) {
  return apiClient('/kits', {
    method: 'POST',
    body: JSON.stringify(kitData)
  });
}

export async function generatePrepKit(kitData) {
  return apiClient('/kits/generate', {
    method: 'POST',
    body: JSON.stringify(kitData),
    timeout: 180000 // 3 minutes timeout for complete 8-stage AI synthesis
  });
}

// Editable Kit Builder API Helpers
export async function updateKit(id, updates) {
  return apiClient(`/kits/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates)
  });
}

export async function addQuestion(kitId, questionData) {
  return apiClient(`/kits/${kitId}/questions`, {
    method: 'POST',
    body: JSON.stringify(questionData)
  });
}

export async function updateQuestion(kitId, questionId, updates) {
  return apiClient(`/kits/${kitId}/questions/${questionId}`, {
    method: 'PATCH',
    body: JSON.stringify(updates)
  });
}

export async function deleteQuestion(kitId, questionId) {
  return apiClient(`/kits/${kitId}/questions/${questionId}`, {
    method: 'DELETE'
  });
}

export async function reorderQuestions(kitId, moduleId, orderedQuestionIds) {
  return apiClient(`/kits/${kitId}/questions/reorder`, {
    method: 'POST',
    body: JSON.stringify({ moduleId, orderedQuestionIds })
  });
}

export async function addFlashcard(kitId, cardData) {
  return apiClient(`/kits/${kitId}/flashcards`, {
    method: 'POST',
    body: JSON.stringify(cardData)
  });
}

export async function updateFlashcard(kitId, cardId, updates) {
  return apiClient(`/kits/${kitId}/flashcards/${cardId}`, {
    method: 'PATCH',
    body: JSON.stringify(updates)
  });
}

export async function deleteFlashcard(kitId, cardId) {
  return apiClient(`/kits/${kitId}/flashcards/${cardId}`, {
    method: 'DELETE'
  });
}

export async function regenerateKitSection(kitId, options) {
  return apiClient(`/kits/${kitId}/regenerate`, {
    method: 'POST',
    body: JSON.stringify(options)
  });
}

export async function generateSchedule(kitId, totalDays) {
  return apiClient(`/kits/${kitId}/schedule`, {
    method: 'POST',
    body: JSON.stringify({ totalDays })
  });
}

export async function fetchPracticeSession(kitId, options = {}) {
  const query = new URLSearchParams();
  if (options.filter) query.set('filter', options.filter);
  if (options.category) query.set('category', options.category);
  const qs = query.toString() ? `?${query.toString()}` : '';
  return apiClient(`/kits/${kitId}/flashcards/practice${qs}`);
}

export async function submitCardReview(kitId, cardId, reviewData) {
  return apiClient(`/kits/${kitId}/flashcards/${cardId}/review`, {
    method: 'POST',
    body: JSON.stringify(reviewData)
  });
}

export async function resetPracticeProgress(kitId) {
  return apiClient(`/kits/${kitId}/flashcards/reset-practice`, {
    method: 'POST'
  });
}

export default apiClient;
