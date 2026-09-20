import { BaseLlmProvider } from './baseProvider.js';
import { ProviderRateLimitError, ProviderServiceError } from '../resilience/retryWithBackoff.js';

/**
 * Deterministic Mock LLM Provider for hermetic testing, offline evaluation,
 * and automated batch benchmarking without requiring live API keys.
 */
export class MockLlmProvider extends BaseLlmProvider {
  constructor(options = {}) {
    super('mock');
    this.customHandlers = [];
    this.responseQueue = [];
    this.callHistory = [];
    this.rateLimitFailuresRemaining = options.rateLimitFailuresRemaining || 0;
    this.serverFailuresRemaining = options.serverFailuresRemaining || 0;
    this.malformedJsonRemaining = options.malformedJsonRemaining || 0;
  }

  /**
   * Queue a sequence of raw responses or errors to return in order
   */
  queueResponse(responseOrError) {
    this.responseQueue.push(responseOrError);
  }

  /**
   * Register a custom handler that matches prompt patterns
   */
  registerHandler(matcher, handler) {
    this.customHandlers.unshift({ matcher, handler });
  }

  /**
   * Reset state between test runs
   */
  reset() {
    this.customHandlers = [];
    this.responseQueue = [];
    this.callHistory = [];
    this.rateLimitFailuresRemaining = 0;
    this.serverFailuresRemaining = 0;
    this.malformedJsonRemaining = 0;
  }

  async generate({ systemPrompt = '', userPrompt = '', temperature = 0.2, maxTokens = 4096, responseFormat = 'json' }) {
    this.callHistory.push({ systemPrompt, userPrompt, temperature, maxTokens, responseFormat, timestamp: Date.now() });

    // 1. Check simulated rate limits
    if (this.rateLimitFailuresRemaining > 0) {
      this.rateLimitFailuresRemaining--;
      throw new ProviderRateLimitError('Rate limit exceeded: 429 Too Many Requests (Simulated Mock)');
    }

    // 2. Check simulated server failures
    if (this.serverFailuresRemaining > 0) {
      this.serverFailuresRemaining--;
      throw new ProviderServiceError('Internal LLM server error: 500 Internal Server Error (Simulated Mock)', 500);
    }

    // 3. Check simulated malformed JSON
    if (this.malformedJsonRemaining > 0) {
      this.malformedJsonRemaining--;
      return {
        content: '```json\n{ "invalid": "json", trailing_comma: true, }\n```'
      };
    }

    // 4. Check queued responses
    if (this.responseQueue.length > 0) {
      const next = this.responseQueue.shift();
      if (next instanceof Error) {
        throw next;
      }
      return typeof next === 'string' ? { content: next } : next;
    }

    // 5. Check custom registered handlers
    for (const { matcher, handler } of this.customHandlers) {
      const matches = typeof matcher === 'function' 
        ? matcher(userPrompt, systemPrompt) 
        : (matcher instanceof RegExp ? (matcher.test(userPrompt) || matcher.test(systemPrompt)) : (userPrompt.includes(matcher) || systemPrompt.includes(matcher)));

      if (matches) {
        const result = await handler({ userPrompt, systemPrompt });
        return typeof result === 'string' ? { content: result } : result;
      }
    }

    // 6. Default smart staged generators based on prompt content
    const combined = `${systemPrompt} ${userPrompt}`.toLowerCase();

    // Stage 1: Requirements
    if (combined.includes('stage 1') || combined.includes('extract requirements') || combined.includes('job description')) {
      const lowerUser = userPrompt.toLowerCase();
      const jdMatch = userPrompt.match(/JOB DESCRIPTION:\s*"""([\s\S]*?)"""/i);
      const jdText = jdMatch ? jdMatch[1].trim() : userPrompt;
      const isSparse = lowerUser.includes('sparse') || jdText.length < 70;
      if (isSparse) {
        return {
          content: JSON.stringify({
            requirements: [
              {
                id: 'req-tech-1',
                text: 'Basic JavaScript and HTML knowledge',
                kind: 'technical',
                priority: 'must-have',
                sourceSnippet: 'Looking for a developer with JavaScript knowledge.'
              }
            ],
            isSparseJd: true,
            insufficientInfoNotes: 'Job description is minimal and lacks specifics on architecture, experience level, testing expectations, or infrastructure.'
          })
        };
      }

      return {
        content: JSON.stringify({
          requirements: [
            {
              id: 'req-tech-1',
              text: 'Distributed systems engineering with Node.js and microservices',
              kind: 'technical',
              priority: 'must-have',
              sourceSnippet: 'Must have 5+ years building backend microservices with Node.js and Express'
            },
            {
              id: 'req-tech-2',
              text: 'High-throughput event streaming with Apache Kafka',
              kind: 'technical',
              priority: 'must-have',
              sourceSnippet: 'Experience with Kafka topic partitioning and consumer group rebalancing'
            },
            {
              id: 'req-domain-1',
              text: 'High-concurrency payment and transaction processing',
              kind: 'domain',
              priority: 'nice-to-have',
              sourceSnippet: 'Familiarity with idempotent payment gateways and ledger reconciliation'
            },
            {
              id: 'req-behav-1',
              text: 'Cross-functional engineering leadership and technical mentorship',
              kind: 'behavioral',
              priority: 'must-have',
              sourceSnippet: 'Proven ability to mentor junior engineers and coordinate cross-team architectures'
            }
          ],
          isSparseJd: false,
          insufficientInfoNotes: null
        })
      };
    }

    // Stage 2: Company Brief
    if (combined.includes('stage 2') || combined.includes('company brief') || combined.includes('retrieved sources')) {
      return {
        content: JSON.stringify({
          companyBrief: {
            overview: 'Acme Corp is an enterprise cloud payment infrastructure provider powering high-volume online checkouts globally.',
            missionValues: [
              'Developer-first reliability and transparency',
              'Relentless optimization for sub-50ms latency',
              'Customer trust and zero financial inaccuracies'
            ],
            products: ['Acme Ledger', 'Checkout Gateway', 'Fraud Shield AI'],
            techStack: ['Node.js', 'Go', 'Kafka', 'PostgreSQL', 'Docker', 'Kubernetes'],
            interviewCulture: 'Rigorous engineering interviews focusing on architecture, edge cases, distributed concurrency, and proactive system resilience.',
            sourceAttribution: ['https://example.com/about', 'https://example.com/careers']
          }
        })
      };
    }

    // Stage 3: Role Breakdown
    if (combined.includes('stage 3') || combined.includes('role breakdown')) {
      return {
        content: JSON.stringify({
          roleBreakdown: {
            title: 'Senior Backend Engineer',
            seniority: 'Senior',
            coreFocus: 'Designing and scaling event-driven transaction pipelines and fault-tolerant payment APIs',
            dayToDayResponsibilities: [
              'Architect event-driven pipelines using Node.js and Kafka',
              'Ensure 99.999% uptime for transaction processing endpoints',
              'Participate in on-call rotation and lead root-cause analyses',
              'Mentor junior and mid-level developers'
            ],
            primaryChallenges: [
              'Eliminating duplicate transaction processing during network partitions',
              'Managing database failover latency and Kafka partition rebalancing'
            ],
            successCriteria: [
              'Deliver zero-loss message processing pipeline within first 90 days',
              'Decrease end-to-end API response times by 25%'
            ]
          }
        })
      };
    }

    // Stage 4: Technical Questions
    if (combined.includes('stage 4') || combined.includes('technical questions')) {
      return {
        content: JSON.stringify({
          questions: [
            {
              id: 'q-tech-1',
              question: 'How do you design Kafka consumer groups in Node.js to prevent data loss or duplicate processing during partition rebalances?',
              targetRequirementIds: ['req-tech-1', 'req-tech-2'],
              category: 'TECHNICAL_DEEP_DIVE',
              difficulty: 'SENIOR',
              estimatedMinutes: 20,
              answerFramework: {
                approach: 'Explain cooperative sticky partition assignor and explicit offset commit strategies',
                keyPointsToCover: ['Cooperative sticky assignor', 'Manual commit after idempotent processing', 'Heartbeat configuration'],
                commonTraps: ['Using auto-commit or stopping world during rebalance']
              },
              rubric: {
                criteria: 'Kafka distributed streaming internals and transaction idempotency in Node.js',
                level1Deficient: 'Unaware of partition rebalancing or uses naive auto-commit with no error handling',
                level3Acceptable: 'Explains manual offset commit after processing and consumer heartbeat timeouts',
                level5Exceptional: 'Proposes cooperative rebalance protocol, static membership (group.instance.id), and out-of-band dead letter queues'
              },
              followUpProbes: [
                'What happens if max.poll.interval.ms is exceeded during batch execution?'
              ]
            }
          ]
        })
      };
    }

    // Stage 5: Behavioral Questions
    if (combined.includes('stage 5') || combined.includes('behavioural questions') || combined.includes('behavioral interviewer')) {
      return {
        content: JSON.stringify({
          questions: [
            {
              id: 'q-behav-1',
              question: 'Describe a situation where you had to push back on a high-priority product deadline because technical debt posed severe production risk.',
              targetRequirementIds: ['req-behav-1'],
              category: 'BEHAVIORAL',
              difficulty: 'SENIOR',
              estimatedMinutes: 15,
              answerFramework: {
                approach: 'Use STAR method: explain quantified risk, stakeholder alignment, and phased compromise',
                keyPointsToCover: ['Objective data/metrics', 'Stakeholder empathy', 'Collaborative mitigation plan'],
                commonTraps: ['Blaming product managers or refusing to compromise']
              },
              rubric: {
                criteria: 'Technical communication, conflict resolution, and risk prioritization',
                level1Deficient: 'Passive aggressive or uncompromising; cannot communicate risk in business terms',
                level3Acceptable: 'Explains the technical risk clearly and proposed a reasonable time extension',
                level5Exceptional: 'Quantified downtime cost, decoupled release into safe phases, and built alignment without sacrificing quality'
              },
              followUpProbes: [
                'How did you maintain developer team morale during that crunch period?'
              ]
            }
          ]
        })
      };
    }

    // Stage 6: System Design
    if (combined.includes('stage 6') || combined.includes('system-design') || combined.includes('system design')) {
      return {
        content: JSON.stringify({
          questions: [
            {
              id: 'q-sys-1',
              question: 'Design a globally distributed payment ledger that guarantees exactly-once transaction processing and sub-100ms response times under 50,000 TPS.',
              targetRequirementIds: ['req-tech-1', 'req-tech-2'],
              category: 'SYSTEM_DESIGN',
              difficulty: 'SENIOR',
              estimatedMinutes: 30,
              answerFramework: {
                approach: 'Outline functional and non-functional requirements, data model, consensus/partitioning, and failure recovery',
                keyPointsToCover: ['Idempotency keys with Redis distributed locks', 'Two-phase commit vs Saga orchestrator', 'Partitioning by account ID', 'Read replicas vs event sourcing'],
                commonTraps: ['Relying on distributed ACID transactions across regions without discussing CAP theorem trade-offs']
              },
              rubric: {
                criteria: 'Distributed ledger architecture, idempotency, consensus, and horizontal scalability',
                level1Deficient: 'Single relational database with synchronous locks; fails to handle network partitions',
                level3Acceptable: 'Proposes sharded database with idempotency keys and asynchronous event publishing',
                level5Exceptional: 'Comprehensive Saga pattern, outbox pattern for DB-Kafka consistency, Raft consensus for state, and clear partition strategies'
              },
              followUpProbes: [
                'How does your ledger handle network split-brain scenarios between EU and US data centers?'
              ]
            }
          ]
        })
      };
    }

    // Stage 7: Company Fit
    if (combined.includes('stage 7') || combined.includes('company-fit') || combined.includes('company fit')) {
      return {
        content: JSON.stringify({
          questions: [
            {
              id: 'q-fit-1',
              question: 'Acme powers financial checkouts where downtime directly causes revenue loss for merchants. How do you approach production observability and proactive failure detection?',
              targetRequirementIds: ['req-domain-1', 'req-tech-1'],
              category: 'COMPANY_SPECIFIC',
              difficulty: 'SENIOR',
              estimatedMinutes: 15,
              answerFramework: {
                approach: 'Connect personal monitoring philosophy with Acme mission of developer-first reliability',
                keyPointsToCover: ['SLIs/SLOs', 'Distributed tracing (OpenTelemetry)', 'Canary deployments', 'Chaos engineering'],
                commonTraps: ['Listing passive log tools without discussing proactive alerting or MTTR reduction']
              },
              rubric: {
                criteria: 'Alignment with high-reliability payment infrastructure values',
                level1Deficient: 'Only checks logs after customer complaints occur',
                level3Acceptable: 'Discusses APM alerts, Prometheus metrics, and automated rollback thresholds',
                level5Exceptional: 'Demonstrates deep empathy for merchant revenue impact, proactive chaos drills, and synthetic transaction probes'
              },
              followUpProbes: [
                'How do you balance aggressive feature delivery with stringent zero-downtime requirements?'
              ]
            }
          ]
        })
      };
    }

    // Stage 8: Flashcards
    if (combined.includes('stage 8') || combined.includes('flashcard') || combined.includes('flashcards')) {
      return {
        content: JSON.stringify({
          flashcards: [
            {
              id: 'fc-1',
              targetRequirementId: 'req-tech-2',
              category: 'DISTRIBUTED_STREAMING',
              frontPrompt: 'What is the key difference between Kafka Eager Rebalancing and Cooperative Sticky Rebalancing?',
              backKeyPoints: [
                'Eager rebalancing revokes all partitions from all consumers, causing a "stop-the-world" pause.',
                'Cooperative Sticky Rebalancing revokes only the specific partitions being moved, allowing other consumers to keep processing uninterrupted.',
                'Configured via partition.assignment.strategy in modern Kafka clients.'
              ],
              quickTip: 'Always mention CooperativeStickyAssignor in senior backend interviews to show modern production awareness.'
            },
            {
              id: 'fc-2',
              targetRequirementId: 'req-tech-1',
              category: 'NODEJS_INTERNALS',
              frontPrompt: 'How do you prevent Node.js Event Loop starvation during CPU-heavy operations?',
              backKeyPoints: [
                'Offload computation to Worker Threads or external microservices.',
                'Partition heavy loops using setImmediate() or process.nextTick() chunking.',
                'Never perform synchronous cryptographic or compression calls in request handling paths.'
              ],
              quickTip: 'Point out that Node.js is single-threaded for execution but utilizes libuv thread pool for async I/O.'
            }
          ]
        })
      };
    }

    // Default fallback
    return {
      content: JSON.stringify({ message: 'Mock LLM completed', userPromptLength: userPrompt.length })
    };
  }
}

export default MockLlmProvider;
