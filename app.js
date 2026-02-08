// Charity Funding Optimiser — App Logic (v2)
// 3-step collaborative flow: Input → Develop & Refine → Final Output
// Uses Cloudflare Workers AI for analysis and document generation.

(function () {
    'use strict';

    // ===== API Configuration =====
    var API_URL = 'https://charity-funding-api.charityfundingtool.workers.dev';

    // ===== State =====
    var state = {
        mode: 'draft',          // 'draft' or 'notes'
        funderName: '',
        userInput: '',
        detected: {},           // what we extracted from their input
        funderInfo: {},         // funder priorities/values
        answers: {},            // user answers to smart questions
        notSure: {},            // which questions marked "not sure"
        isEditing: false
    };

    // ===== DOM Elements =====
    var form = document.getElementById('input-form');
    var funderInput = document.getElementById('funder-name');
    var userInputArea = document.getElementById('user-input');
    var inputHelpText = document.getElementById('input-help-text');
    var modeCards = document.querySelectorAll('.mode-card');

    var step1 = document.getElementById('step-1');
    var step2 = document.getElementById('step-2');
    var step3 = document.getElementById('step-3');
    var loadingSection = document.getElementById('loading-section');
    var loadingMessage = document.getElementById('loading-message');

    var detectedSummary = document.getElementById('detected-summary');
    var funderPrioritiesList = document.getElementById('funder-priorities-list');
    var questionsContainer = document.getElementById('questions-container');

    var reworkBtn = document.getElementById('rework-btn');
    var generateBtn = document.getElementById('generate-btn');

    var fundingRequestOutput = document.getElementById('funding-request-output');
    var alignmentNotes = document.getElementById('alignment-notes');
    var gapsSection = document.getElementById('gaps-section');
    var gapsList = document.getElementById('gaps-list');

    var copyBtn = document.getElementById('copy-btn');
    var editBtn = document.getElementById('edit-btn');
    var backBtn = document.getElementById('back-to-step2-btn');
    var startOverBtn = document.getElementById('start-over-btn');

    var progressSteps = document.querySelectorAll('.progress-step');
    var progressLines = document.querySelectorAll('.progress-line');

    // ===== Placeholder text per mode =====
    var placeholders = {
        draft: 'Paste or type your draft funding bid here. Include as much detail as you can \u2014 what your project does, who it helps, what outcomes you expect, and how much funding you\'re requesting.',
        notes: 'Paste your rough notes, bullet points, or key ideas here. Don\'t worry about structure \u2014 we\'ll help you build a complete funding request from whatever you have.'
    };

    var helpTexts = {
        draft: 'Don\'t worry about it being perfect \u2014 that\'s what this tool is for',
        notes: 'Even a few bullet points will give us enough to work with'
    };

    // ===== Smart Questions Definition =====
    var questionDefs = [
        {
            id: 'amount',
            label: 'How much funding are you requesting?',
            why: 'Funders want specific amounts with justification',
            type: 'text',
            placeholder: 'e.g. \u00a350,000',
            optional: false
        },
        {
            id: 'fundingType',
            label: 'Is this a one-off project or a request for ongoing funding?',
            why: 'This completely changes how your bid is framed',
            type: 'toggle',
            options: ['One-off project', 'Ongoing funding'],
            optional: false
        },
        {
            id: 'duration',
            label: 'Over what time period?',
            why: 'Required for budgeting narrative',
            type: 'select',
            options: ['6 months', '1 year', '2 years', '3 years', 'Other'],
            optional: false
        },
        {
            id: 'beneficiaries',
            label: 'Who are the primary beneficiaries?',
            why: 'Must match funder priorities for strongest alignment',
            type: 'text',
            placeholder: 'e.g. Young people aged 16-25 in South London',
            optional: false
        },
        {
            id: 'reach',
            label: 'How many people will benefit?',
            why: 'Funders want scale and reach data',
            type: 'text',
            placeholder: 'e.g. 200 direct beneficiaries, 500 indirect',
            optional: false
        },
        {
            id: 'evidence',
            label: 'What evidence of need do you have?',
            why: 'Strengthens the case significantly',
            type: 'textarea',
            placeholder: 'e.g. Local needs assessment data, ONS statistics, consultation findings...',
            optional: true
        },
        {
            id: 'success',
            label: 'What will success look like?',
            why: 'Outcomes and impact measurement are critical for funders',
            type: 'textarea',
            placeholder: 'e.g. 80% of participants report improved wellbeing; 50 people gain qualifications...',
            optional: false
        },
        {
            id: 'sustainability',
            label: 'What happens when the funding ends?',
            why: 'Sustainability \u2014 funders always ask this question',
            type: 'textarea',
            placeholder: 'e.g. We will seek continuation funding, embed in core services, train volunteers...',
            optional: true
        }
    ];

    // ===== Funder Recognition =====
    function getFunderInfo(funderName) {
        var lower = funderName.toLowerCase();
        if (lower.includes('lottery') || lower.includes('national lottery')) {
            return {
                name: funderName,
                focus: 'community-led change, reaching underserved groups, and building stronger communities',
                values: ['Community voice and ownership', 'Reaching people most in need', 'Strengths-based approaches', 'Partnerships and collaboration', 'Learning and evaluation'],
                tip: 'The National Lottery Community Fund particularly values applications where the community has been involved in designing the project. Consider adding specific examples of community consultation.',
                language: ['community-led', 'strengths-based', 'people and places', 'co-design']
            };
        }
        if (lower.includes('comic relief')) {
            return {
                name: funderName,
                focus: 'tackling poverty and social injustice, with a strong emphasis on lived experience and systemic change',
                values: ['Lived experience leadership', 'Tackling root causes of poverty', 'Social justice and equity', 'Power-shifting to communities', 'Sustainable impact'],
                tip: 'Comic Relief prioritises organisations led by people with lived experience of the issues they address. Highlight any lived experience within your team or governance.',
                language: ['lived experience', 'power-shifting', 'systemic change', 'social justice']
            };
        }
        if (lower.includes('lloyds') || lower.includes('lloyd')) {
            return {
                name: funderName,
                focus: 'helping people overcome complex social issues through long-term, flexible partnerships',
                values: ['Addressing complex social issues', 'Unrestricted funding approaches', 'Organisational development', 'Long-term partnerships', 'Reaching those most disadvantaged'],
                tip: 'Lloyds Foundation focuses on small and medium-sized charities. Emphasise your organisation\'s deep connection to the communities you serve and your track record of impact.',
                language: ['complex social issues', 'unrestricted', 'flexible', 'partnership']
            };
        }
        if (lower.includes('heritage') || lower.includes('lottery heritage')) {
            return {
                name: funderName,
                focus: 'involving people and communities in heritage, broadening access, and building skills for heritage',
                values: ['Widening access to heritage', 'Inclusion and diversity', 'Building heritage skills', 'Community engagement', 'Environmental sustainability'],
                tip: 'Heritage Fund applications score well when they demonstrate genuine community involvement in heritage and clear plans for widening access to underrepresented groups.',
                language: ['heritage', 'access', 'inclusion', 'skills development']
            };
        }
        // Generic funder
        return {
            name: funderName,
            focus: 'community impact, sustainability, and evidence-based approaches to social change',
            values: ['Demonstrated community need', 'Clear outcomes and impact measurement', 'Value for money', 'Sustainability beyond the funding period', 'Partnership working'],
            tip: 'Research ' + funderName + '\'s latest annual report and funding guidelines for their current strategic priorities. Tailoring your language to match their framework significantly strengthens applications.',
            language: ['impact', 'outcomes', 'evidence-based', 'sustainability']
        };
    }

    // ===== Input Analysis / Detection =====
    function analyseInput(text) {
        var detected = {};

        // Detect funding amount
        var amountMatch = text.match(/\u00a3[\d,]+(?:\.\d{2})?/);
        if (amountMatch) {
            detected.amount = amountMatch[0];
        }

        // Detect funding type
        if (/\bone[- ]?off\b/i.test(text) || /\bproject\b/i.test(text) && !/\bongoing\b/i.test(text)) {
            detected.fundingType = 'One-off project';
        } else if (/\bongoing\b|\bannual\b|\bcontinuing\b|\bcore funding\b/i.test(text)) {
            detected.fundingType = 'Ongoing funding';
        }

        // Detect duration
        if (/\b6\s*months?\b/i.test(text)) {
            detected.duration = '6 months';
        } else if (/\b1\s*year\b|\b12\s*months?\b|\bone\s*year\b/i.test(text)) {
            detected.duration = '1 year';
        } else if (/\b2\s*years?\b|\b24\s*months?\b|\btwo\s*years?\b/i.test(text)) {
            detected.duration = '2 years';
        } else if (/\b3\s*years?\b|\b36\s*months?\b|\bthree\s*years?\b/i.test(text)) {
            detected.duration = '3 years';
        }

        // Detect beneficiaries
        var beneficiaryPatterns = [
            { pattern: /young\s*people|youth|teenagers?/i, group: 'Young people' },
            { pattern: /children|child(?:ren)?/i, group: 'Children' },
            { pattern: /older\s*(?:people|adults?)|elderly|pensioners?|over[- ]?65s?/i, group: 'Older people' },
            { pattern: /disab(?:led|ility|ilities)/i, group: 'People with disabilities' },
            { pattern: /mental\s*health|wellbeing|well[- ]?being/i, group: 'People experiencing mental health challenges' },
            { pattern: /homeless(?:ness)?|rough\s*sleep/i, group: 'People experiencing homelessness' },
            { pattern: /refugee|asylum/i, group: 'Refugees and asylum seekers' },
            { pattern: /women|girls|female/i, group: 'Women and girls' },
            { pattern: /famil(?:y|ies)/i, group: 'Families' },
            { pattern: /carers?/i, group: 'Carers' },
            { pattern: /BAME|ethnic\s*minorit|black|Asian/i, group: 'Ethnic minority communities' },
            { pattern: /LGBTQ|LGBT|queer|trans/i, group: 'LGBTQ+ community' }
        ];
        var foundGroups = [];
        beneficiaryPatterns.forEach(function (bp) {
            if (bp.pattern.test(text)) {
                foundGroups.push(bp.group);
            }
        });
        if (foundGroups.length > 0) {
            detected.beneficiaries = foundGroups.join(', ');
        }

        // Detect reach numbers (numbers near people words)
        var reachMatch = text.match(/(\d[\d,]*)\s*(?:people|participants?|beneficiaries|individuals?|young\s*people|children|families|members?)/i);
        if (reachMatch) {
            detected.reach = reachMatch[1].replace(/,/g, '') + ' ' + reachMatch[0].replace(reachMatch[1], '').trim();
        }

        // Detect evidence
        if (/evidence|research|data|statistic|survey|consultation|needs\s*assessment|census|ONS/i.test(text)) {
            detected.hasEvidence = true;
            // Try to extract a snippet
            var evidenceMatch = text.match(/(?:evidence|research|data|statistic|survey|consultation)[^.]*\./i);
            if (evidenceMatch) {
                detected.evidence = evidenceMatch[0].trim();
            }
        }

        // Detect success/outcomes
        if (/outcome|impact|success|measur|result|achieve|improve/i.test(text)) {
            detected.hasOutcomes = true;
            var outcomeMatch = text.match(/(?:outcome|success|measur|result|achieve|improve)[^.]*\./i);
            if (outcomeMatch) {
                detected.success = outcomeMatch[0].trim();
            }
        }

        // Detect sustainability
        if (/sustainab|after\s*(?:the\s*)?funding|legacy|continuation|embed|long[- ]?term/i.test(text)) {
            detected.hasSustainability = true;
            var sustMatch = text.match(/(?:sustainab|after\s*(?:the\s*)?funding|legacy|continuation)[^.]*\./i);
            if (sustMatch) {
                detected.sustainability = sustMatch[0].trim();
            }
        }

        // Detect project type / rough scope
        var projectTypes = [];
        if (/training|workshop|session|programme|program/i.test(text)) projectTypes.push('Training / programme delivery');
        if (/capital|building|refurbish|renovation|equipment/i.test(text)) projectTypes.push('Capital / equipment');
        if (/staff|salary|salaries|coordinator|worker|officer/i.test(text)) projectTypes.push('Staffing');
        if (/outreach|engagement|community\s*work/i.test(text)) projectTypes.push('Outreach / community engagement');
        if (/research|evaluation|pilot/i.test(text)) projectTypes.push('Research / pilot');
        if (/event|festival|celebration/i.test(text)) projectTypes.push('Events');
        detected.projectTypes = projectTypes;

        return detected;
    }

    // ===== Mode Selection =====
    modeCards.forEach(function (card) {
        card.addEventListener('click', function () {
            modeCards.forEach(function (c) { c.classList.remove('active'); });
            card.classList.add('active');
            state.mode = card.getAttribute('data-mode');
            userInputArea.placeholder = placeholders[state.mode];
            inputHelpText.textContent = helpTexts[state.mode];
        });
    });

    // ===== Progress Bar =====
    function updateProgress(activeStep) {
        progressSteps.forEach(function (step, i) {
            var stepNum = i + 1;
            step.classList.remove('active', 'completed');
            if (stepNum === activeStep) {
                step.classList.add('active');
            } else if (stepNum < activeStep) {
                step.classList.add('completed');
                // Replace number with tick
                step.querySelector('.progress-circle').textContent = '\u2713';
            } else {
                step.querySelector('.progress-circle').textContent = String(stepNum);
            }
        });
        progressLines.forEach(function (line, i) {
            line.classList.toggle('completed', i < activeStep - 1);
        });
    }

    // ===== Show/Hide Sections =====
    function showSection(sectionId) {
        [step1, step2, step3, loadingSection].forEach(function (s) {
            s.classList.add('hidden');
        });
        document.getElementById(sectionId).classList.remove('hidden');
    }

    // ===== Loading Simulation =====
    function showLoading(messages, duration) {
        return new Promise(function (resolve) {
            showSection('loading-section');
            var idx = 0;
            loadingMessage.textContent = messages[0];
            var interval = setInterval(function () {
                idx++;
                if (idx < messages.length) {
                    loadingMessage.textContent = messages[idx];
                }
            }, duration / messages.length);

            setTimeout(function () {
                clearInterval(interval);
                resolve();
            }, duration);
        });
    }

    // ===== Form Submission → Step 2 =====
    form.addEventListener('submit', function (e) {
        e.preventDefault();
        state.funderName = funderInput.value.trim();
        state.userInput = userInputArea.value.trim();
        if (!state.funderName || !state.userInput) return;

        goToStep2();
    });

    async function goToStep2() {
        updateProgress(2);

        // Show loading while AI analyses
        showSection('loading-section');
        var msgIdx = 0;
        var aiMessages = [
            'Analysing your input\u2026',
            'Identifying key information\u2026',
            'Checking funder priorities\u2026',
            'Preparing your working page\u2026'
        ];
        loadingMessage.textContent = aiMessages[0];
        var msgInterval = setInterval(function () {
            msgIdx++;
            if (msgIdx < aiMessages.length) {
                loadingMessage.textContent = aiMessages[msgIdx];
            }
        }, 2000);

        // Start with local detection (instant, always works)
        state.detected = analyseInput(state.userInput);
        state.funderInfo = getFunderInfo(state.funderName);

        // Call AI for analysis
        try {
            var response = await fetch(API_URL + '/analyse', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    funderName: state.funderName,
                    userInput: state.userInput,
                    mode: state.mode
                })
            });

            if (!response.ok) {
                throw new Error('API returned ' + response.status);
            }

            var data = await response.json();
            var ai = data.analysis || {};

            // Merge AI analysis with local detection (AI takes priority where it found something)
            if (ai.amount) state.detected.amount = ai.amount;
            if (ai.fundingType) state.detected.fundingType = ai.fundingType;
            if (ai.duration) state.detected.duration = ai.duration;
            if (ai.beneficiaries) state.detected.beneficiaries = ai.beneficiaries;
            if (ai.reach) state.detected.reach = ai.reach;
            if (ai.evidence) { state.detected.evidence = ai.evidence; state.detected.hasEvidence = true; }
            if (ai.success) { state.detected.success = ai.success; state.detected.hasOutcomes = true; }
            if (ai.sustainability) { state.detected.sustainability = ai.sustainability; state.detected.hasSustainability = true; }
            if (ai.projectSummary) state.detected.projectSummary = ai.projectSummary;
            if (ai.projectTypes && ai.projectTypes.length > 0) state.detected.projectTypes = ai.projectTypes;
            if (ai.strengths) state.detected.strengths = ai.strengths;
            if (ai.gaps) state.detected.aiGaps = ai.gaps;
        } catch (err) {
            clearInterval(msgInterval);
            showError('We cannot analyse your request at this time. Please try again in a moment.');
            return;
        }

        clearInterval(msgInterval);

        // Pre-fill answers from detected data
        if (state.detected.amount && !state.answers.amount) state.answers.amount = state.detected.amount;
        if (state.detected.fundingType && !state.answers.fundingType) state.answers.fundingType = state.detected.fundingType;
        if (state.detected.duration && !state.answers.duration) state.answers.duration = state.detected.duration;
        if (state.detected.beneficiaries && !state.answers.beneficiaries) state.answers.beneficiaries = state.detected.beneficiaries;
        if (state.detected.reach && !state.answers.reach) state.answers.reach = state.detected.reach;
        if (state.detected.evidence && !state.answers.evidence) state.answers.evidence = state.detected.evidence;
        if (state.detected.success && !state.answers.success) state.answers.success = state.detected.success;
        if (state.detected.sustainability && !state.answers.sustainability) state.answers.sustainability = state.detected.sustainability;

        renderStep2();
        showSection('step-2');
        step2.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // ===== Render Step 2 =====
    function renderStep2() {
        renderSummary();
        renderQuestions();
    }

    function renderSummary() {
        // Build detected summary
        var html = '';
        var d = state.detected;

        if (state.mode === 'draft') {
            html += '<p><strong>Mode:</strong> Optimising your draft funding bid</p>';
        } else {
            html += '<p><strong>Mode:</strong> Building a structured bid from your notes</p>';
        }

        // Project types
        if (d.projectTypes && d.projectTypes.length > 0) {
            html += '<p><strong>Project type:</strong> ';
            d.projectTypes.forEach(function (t) {
                html += '<span class="detected-tag">' + escapeHtml(t) + '</span>';
            });
            html += '</p>';
        }

        // Detected items
        var detectedItems = [];
        if (d.amount) detectedItems.push('Funding amount: ' + d.amount);
        if (d.fundingType) detectedItems.push('Type: ' + d.fundingType);
        if (d.duration) detectedItems.push('Duration: ' + d.duration);
        if (d.beneficiaries) detectedItems.push('Beneficiaries: ' + d.beneficiaries);
        if (d.reach) detectedItems.push('Reach: ' + d.reach);
        if (d.hasEvidence) detectedItems.push('Evidence of need mentioned');
        if (d.hasOutcomes) detectedItems.push('Outcomes/impact mentioned');
        if (d.hasSustainability) detectedItems.push('Sustainability mentioned');

        if (detectedItems.length > 0) {
            html += '<p><strong>Detected from your input:</strong></p>';
            detectedItems.forEach(function (item) {
                html += '<span class="detected-tag">' + escapeHtml(item) + '</span>';
            });
        } else {
            html += '<p>We couldn\'t detect specific details from your input yet \u2014 answer the questions below to build a strong application.</p>';
        }

        // AI project summary
        if (d.projectSummary) {
            html += '<p style="margin-top: 12px;"><strong>Project summary:</strong> ' + escapeHtml(d.projectSummary) + '</p>';
        }

        // AI-detected strengths
        if (d.strengths && d.strengths.length > 0) {
            html += '<p style="margin-top: 10px;"><strong>Strengths identified:</strong></p>';
            d.strengths.forEach(function (s) {
                html += '<span class="detected-tag">' + escapeHtml(s) + '</span>';
            });
        }

        // AI-detected gaps
        if (d.aiGaps && d.aiGaps.length > 0) {
            html += '<p style="margin-top: 10px;"><strong>Areas to strengthen:</strong></p>';
            d.aiGaps.forEach(function (g) {
                html += '<span class="detected-tag" style="background: #fef3cd; border-color: #f1c40f; color: #856404;">' + escapeHtml(g) + '</span>';
            });
        }

        detectedSummary.innerHTML = html;

        // Funder priorities
        var fhtml = '<ul>';
        state.funderInfo.values.forEach(function (v) {
            fhtml += '<li>' + escapeHtml(v) + '</li>';
        });
        fhtml += '</ul>';
        fhtml += '<p style="font-size: 0.85rem; margin-top: 8px; color: #5d6d7e;"><strong>Tip:</strong> ' + escapeHtml(state.funderInfo.tip) + '</p>';
        funderPrioritiesList.innerHTML = fhtml;
    }

    function renderQuestions() {
        questionsContainer.innerHTML = '';

        questionDefs.forEach(function (q) {
            var card = document.createElement('div');
            card.className = 'question-card';
            card.setAttribute('data-question-id', q.id);

            var prefilled = state.detected[q.id] !== undefined && state.detected[q.id] !== '';
            var isNotSure = state.notSure[q.id] === true;

            if (prefilled && !isNotSure) card.classList.add('prefilled');
            if (isNotSure) card.classList.add('not-sure-active');

            // Header
            var header = '<div class="question-header"><span class="question-label">' + escapeHtml(q.label);
            if (prefilled) {
                header += '<span class="prefill-badge">Detected</span>';
            }
            header += '</span></div>';
            header += '<div class="question-why">' + escapeHtml(q.why) + '</div>';

            var input = '';
            var currentValue = state.answers[q.id] || '';

            if (q.type === 'text') {
                input = '<input type="text" data-qid="' + q.id + '" placeholder="' + escapeHtml(q.placeholder || '') + '" value="' + escapeHtml(currentValue) + '"' + (isNotSure ? ' disabled' : '') + '>';
            } else if (q.type === 'textarea') {
                input = '<textarea data-qid="' + q.id + '" placeholder="' + escapeHtml(q.placeholder || '') + '"' + (isNotSure ? ' disabled' : '') + '>' + escapeHtml(currentValue) + '</textarea>';
            } else if (q.type === 'toggle') {
                input = '<div class="toggle-group">';
                q.options.forEach(function (opt) {
                    var activeClass = currentValue === opt ? ' active' : '';
                    input += '<button type="button" class="toggle-option' + activeClass + '" data-qid="' + q.id + '" data-value="' + escapeHtml(opt) + '"' + (isNotSure ? ' disabled' : '') + '>' + escapeHtml(opt) + '</button>';
                });
                input += '</div>';
            } else if (q.type === 'select') {
                input = '<select data-qid="' + q.id + '"' + (isNotSure ? ' disabled' : '') + '>';
                input += '<option value="">Select...</option>';
                q.options.forEach(function (opt) {
                    var selected = currentValue === opt ? ' selected' : '';
                    input += '<option value="' + escapeHtml(opt) + '"' + selected + '>' + escapeHtml(opt) + '</option>';
                });
                input += '</select>';
            }

            // Not sure button
            var notSureHtml = '<button type="button" class="not-sure-btn' + (isNotSure ? ' active' : '') + '" data-qid="' + q.id + '">' + (isNotSure ? 'Marked as not sure' : 'Not sure yet') + '</button>';

            card.innerHTML = header + input + notSureHtml;
            questionsContainer.appendChild(card);
        });

        // Attach event listeners
        attachQuestionListeners();
    }

    function attachQuestionListeners() {
        // Text inputs and textareas
        questionsContainer.querySelectorAll('input[type="text"], textarea').forEach(function (el) {
            el.addEventListener('input', function () {
                state.answers[el.getAttribute('data-qid')] = el.value;
            });
        });

        // Selects
        questionsContainer.querySelectorAll('select').forEach(function (el) {
            el.addEventListener('change', function () {
                state.answers[el.getAttribute('data-qid')] = el.value;
            });
        });

        // Toggle buttons
        questionsContainer.querySelectorAll('.toggle-option').forEach(function (btn) {
            btn.addEventListener('click', function () {
                if (btn.disabled) return;
                var qid = btn.getAttribute('data-qid');
                var value = btn.getAttribute('data-value');
                state.answers[qid] = value;
                // Update active state
                var group = btn.parentNode;
                group.querySelectorAll('.toggle-option').forEach(function (b) { b.classList.remove('active'); });
                btn.classList.add('active');
            });
        });

        // Not sure buttons
        questionsContainer.querySelectorAll('.not-sure-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var qid = btn.getAttribute('data-qid');
                state.notSure[qid] = !state.notSure[qid];
                // Re-render just this card
                renderQuestions();
            });
        });
    }

    // ===== Rework Analysis =====
    reworkBtn.addEventListener('click', async function () {
        // Collect current answers into the input for re-analysis
        updateProgress(2);
        var messages = [
            'Re-analysing with your updates\u2026',
            'Checking for new information\u2026',
            'Refreshing recommendations\u2026'
        ];
        await showLoading(messages, 1500 + Math.random() * 500);

        // Re-detect from original input (detected info stays)
        // but also update detected based on any new answers provided
        renderStep2();
        showSection('step-2');
        step2.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    // ===== Generate Funding Request → Step 3 =====
    generateBtn.addEventListener('click', async function () {
        // Collect all answers from the form
        collectAnswersFromDOM();

        updateProgress(3);

        // Show loading while AI generates
        showSection('loading-section');
        var genIdx = 0;
        var genMessages = state.mode === 'draft'
            ? ['Refining your draft\u2026', 'Aligning with funder priorities\u2026', 'Writing your funding request\u2026', 'Polishing the final document\u2026']
            : ['Building your funding request\u2026', 'Structuring your bid\u2026', 'Aligning with funder priorities\u2026', 'Writing the final document\u2026'];
        loadingMessage.textContent = genMessages[0];
        var genInterval = setInterval(function () {
            genIdx++;
            if (genIdx < genMessages.length) {
                loadingMessage.textContent = genMessages[genIdx];
            }
        }, 3000);

        var output;

        // Call AI to generate the document
        try {
            var response = await fetch(API_URL + '/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    funderName: state.funderName,
                    userInput: state.userInput,
                    mode: state.mode,
                    answers: state.answers,
                    notSure: state.notSure,
                    funderInfo: state.funderInfo
                })
            });

            if (!response.ok) {
                throw new Error('API returned ' + response.status);
            }

            var data = await response.json();
            if (!data.document || data.document.trim().length < 100) {
                throw new Error('Response too short');
            }

            output = {
                document: data.document,
                alignment: data.alignment || ''
            };
        } catch (err) {
            clearInterval(genInterval);
            showError('We cannot generate your funding request at this time. Please try again in a moment.');
            return;
        }

        clearInterval(genInterval);

        fundingRequestOutput.innerHTML = output.document;
        alignmentNotes.innerHTML = output.alignment;

        // Gaps
        var gaps = getGaps();
        if (gaps.length > 0) {
            gapsSection.classList.remove('hidden');
            var gapsHtml = '<ul>';
            gaps.forEach(function (g) {
                gapsHtml += '<li>' + escapeHtml(g) + '</li>';
            });
            gapsHtml += '</ul>';
            gapsList.innerHTML = gapsHtml;
        } else {
            gapsSection.classList.add('hidden');
        }

        // Reset edit state
        state.isEditing = false;
        fundingRequestOutput.removeAttribute('contenteditable');
        fundingRequestOutput.classList.remove('editable');
        editBtn.textContent = 'Edit This Request';

        showSection('step-3');
        step3.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    function collectAnswersFromDOM() {
        questionsContainer.querySelectorAll('input[type="text"], textarea').forEach(function (el) {
            state.answers[el.getAttribute('data-qid')] = el.value;
        });
        questionsContainer.querySelectorAll('select').forEach(function (el) {
            state.answers[el.getAttribute('data-qid')] = el.value;
        });
    }

    // ===== Get Gaps (questions marked "not sure" or left empty) =====
    function getGaps() {
        var gaps = [];
        questionDefs.forEach(function (q) {
            if (state.notSure[q.id]) {
                gaps.push(q.label + ' \u2014 marked as "not sure yet". Address this before submitting.');
            } else if (!state.answers[q.id] && !q.optional) {
                gaps.push(q.label + ' \u2014 left blank. Consider adding this information.');
            }
        });
        return gaps;
    }

    // ===== Generate Document =====
    function generateDocument() {
        var a = state.answers;
        var fi = state.funderInfo;
        var d = state.detected;

        var orgName = 'our organisation';
        var amount = a.amount || 'the requested amount';
        var fundingType = a.fundingType || 'project';
        var duration = a.duration || 'the proposed period';
        var beneficiaries = a.beneficiaries || 'our target beneficiaries';
        var reach = a.reach || '';
        var evidence = a.evidence || '';
        var success = a.success || '';
        var sustainability = a.sustainability || '';
        var isOneOff = fundingType === 'One-off project';

        // Build the document
        var doc = '';

        // Opening paragraph
        doc += '<h4>Introduction</h4>';
        if (state.mode === 'draft') {
            doc += '<p>We are writing to ' + escapeHtml(fi.name) + ' to request funding of ' + escapeHtml(amount) + ' for ' + (isOneOff ? 'a ' + escapeHtml(duration) + ' project' : 'ongoing work over ' + escapeHtml(duration)) + ' that directly supports ' + escapeHtml(fi.focus) + '. This application builds on our strong track record of delivering meaningful impact for ' + escapeHtml(beneficiaries) + ', and has been informed by the people and communities who stand to benefit most.</p>';
        } else {
            doc += '<p>We are seeking ' + escapeHtml(amount) + ' from ' + escapeHtml(fi.name) + ' to deliver ' + (isOneOff ? 'a focused ' + escapeHtml(duration) + ' project' : 'an ongoing programme over ' + escapeHtml(duration)) + ' that will make a tangible difference to ' + escapeHtml(beneficiaries) + '. Our work directly aligns with your commitment to ' + escapeHtml(fi.focus) + ', and this proposal has been shaped by the needs and voices of those we serve.</p>';
        }

        // The Need
        doc += '<h4>The Need</h4>';
        if (evidence) {
            doc += '<p>There is clear and compelling evidence for this work. ' + escapeHtml(evidence) + '</p>';
            doc += '<p>' + escapeHtml(beneficiaries) + ' face significant challenges that require dedicated, well-resourced intervention. ';
            if (reach) {
                doc += 'Our ' + (isOneOff ? 'project' : 'programme') + ' will directly reach ' + escapeHtml(reach) + ', addressing needs that are currently unmet in our area.';
            }
            doc += '</p>';
        } else if (state.notSure['evidence']) {
            doc += '<p><em>[Evidence of need to be added \u2014 consider including local statistics, needs assessment data, or consultation findings that demonstrate why this work is necessary.]</em></p>';
        } else {
            doc += '<p>The need for this work is evident in our community. ' + escapeHtml(beneficiaries) + ' face persistent challenges that require dedicated support. ';
            if (reach) {
                doc += 'Our ' + (isOneOff ? 'project' : 'programme') + ' will directly reach ' + escapeHtml(reach) + ', ';
            }
            doc += 'and we have seen first-hand the impact that targeted intervention can have.</p>';
            doc += '<p><em>[Strengthen this section by adding specific local or national statistics that evidence the need. Include sources and dates for credibility.]</em></p>';
        }

        // Your Project
        doc += '<h4>Our ' + (isOneOff ? 'Project' : 'Programme') + '</h4>';
        if (state.mode === 'draft') {
            // Use elements from their original draft
            var inputSnippet = state.userInput.substring(0, 500);
            if (state.userInput.length > 500) inputSnippet += '...';
            doc += '<p>Building on the detail in our full proposal, ' + (isOneOff ? 'this project' : 'this programme') + ' will deliver structured, outcomes-focused activities for ' + escapeHtml(beneficiaries) + ' over ' + escapeHtml(duration) + '. ';
            if (d.projectTypes && d.projectTypes.length > 0) {
                doc += 'Our approach includes ' + escapeHtml(d.projectTypes.join(', ').toLowerCase()) + ', ';
            }
            doc += 'designed to create lasting positive change.</p>';
        } else {
            doc += '<p>';
            if (d.projectTypes && d.projectTypes.length > 0) {
                doc += 'Our ' + (isOneOff ? 'project' : 'programme') + ' will focus on ' + escapeHtml(d.projectTypes.join(', ').toLowerCase()) + ', ';
            } else {
                doc += 'Our ' + (isOneOff ? 'project' : 'programme') + ' will provide ';
            }
            doc += 'delivering structured, evidence-informed support for ' + escapeHtml(beneficiaries) + ' over ' + escapeHtml(duration) + '. ';
            if (reach) {
                doc += 'We aim to reach ' + escapeHtml(reach) + ' through this work. ';
            }
            doc += 'Every element of our delivery has been designed with ' + escapeHtml(fi.name) + '\'s priorities in mind, particularly around ' + escapeHtml(fi.values[0].toLowerCase()) + ' and ' + escapeHtml(fi.values[1].toLowerCase()) + '.</p>';
        }

        // Outcomes
        doc += '<h4>Outcomes and Impact</h4>';
        if (success) {
            doc += '<p>We have identified clear, measurable outcomes for this work:</p>';
            doc += '<p>' + escapeHtml(success) + '</p>';
            doc += '<p>We will use a combination of pre- and post-intervention surveys, case studies, and regular monitoring to track progress against these outcomes. Our evaluation approach will capture both quantitative data and qualitative stories of change.</p>';
        } else if (state.notSure['success']) {
            doc += '<p><em>[Outcomes and success measures to be defined \u2014 funders want specific, measurable outcomes. Consider what will change for your beneficiaries and how you will evidence that change.]</em></p>';
        } else {
            doc += '<p>Our ' + (isOneOff ? 'project' : 'programme') + ' will deliver measurable outcomes for ' + escapeHtml(beneficiaries) + '. We will track impact through regular monitoring and evaluation, using a mix of quantitative measures and qualitative case studies to demonstrate the difference our work makes.</p>';
            doc += '<p><em>[Add specific, measurable outcomes here. For example: "80% of participants will report improved confidence" or "50 people will gain accredited qualifications."]</em></p>';
        }

        // Sustainability
        doc += '<h4>Sustainability</h4>';
        if (sustainability) {
            doc += '<p>' + escapeHtml(sustainability) + '</p>';
            doc += '<p>We are committed to ensuring that the impact of this work extends well beyond the funding period, and have developed a clear plan for sustaining both the activities and the outcomes achieved.</p>';
        } else if (state.notSure['sustainability']) {
            doc += '<p><em>[Sustainability plan to be developed \u2014 funders will want to know what happens when the funding ends. Consider how you will continue the work through other funding, earned income, volunteering, or by embedding it in existing services.]</em></p>';
        } else {
            doc += '<p>We have a clear plan for sustaining the impact of this work beyond the funding period. ';
            if (isOneOff) {
                doc += 'While this is a time-limited project, we will ensure that the learning, resources, and relationships developed are embedded in our ongoing work. We will also actively explore additional funding to continue successful elements.';
            } else {
                doc += 'We are developing diverse income streams to reduce reliance on any single funder, including exploring earned income opportunities, volunteer capacity, and partnership delivery models.';
            }
            doc += '</p>';
        }

        // Budget summary
        doc += '<h4>Budget Summary</h4>';
        doc += '<p>We are requesting ' + escapeHtml(amount) + ' ';
        if (duration && duration !== 'the proposed period') {
            doc += 'over ' + escapeHtml(duration) + ' ';
        }
        doc += 'to deliver this ' + (isOneOff ? 'project' : 'programme') + '. ';
        doc += 'This represents excellent value for money';
        if (reach) {
            doc += ', with a per-beneficiary cost that reflects the depth and quality of our approach';
        }
        doc += '. A detailed budget breakdown is available on request.</p>';

        // Closing
        doc += '<h4>Closing</h4>';
        doc += '<p>We believe this ' + (isOneOff ? 'project' : 'programme') + ' strongly aligns with ' + escapeHtml(fi.name) + '\'s commitment to ' + escapeHtml(fi.focus) + '. We would welcome the opportunity to discuss this proposal further and are happy to provide any additional information required.</p>';
        doc += '<p>Thank you for considering our application. We look forward to hearing from you.</p>';

        // Build alignment notes
        var alignment = '<ul>';
        alignment += '<li><strong>Language alignment:</strong> Your bid mirrors ' + escapeHtml(fi.name) + '\'s terminology. Key phrases to use: <em>' + fi.language.map(escapeHtml).join(', ') + '</em>.</li>';
        alignment += '<li><strong>Priority match:</strong> Your focus on ' + escapeHtml(beneficiaries) + ' aligns with their priority of <em>' + escapeHtml(fi.values[0].toLowerCase()) + '</em>.</li>';

        if (d.hasEvidence || evidence) {
            alignment += '<li><strong>Evidence base:</strong> You\'ve included evidence of need, which significantly strengthens your application.</li>';
        } else {
            alignment += '<li><strong>Evidence gap:</strong> Adding local or national statistics would strengthen your case. Include sources and dates.</li>';
        }

        if (d.hasOutcomes || success) {
            alignment += '<li><strong>Outcomes:</strong> You\'ve outlined what success looks like. Ensure these are specific and measurable.</li>';
        }

        alignment += '<li><strong>Funder insight:</strong> ' + escapeHtml(fi.tip) + '</li>';
        alignment += '</ul>';

        return {
            document: doc,
            alignment: alignment
        };
    }

    // ===== Copy to Clipboard =====
    copyBtn.addEventListener('click', function () {
        var text = fundingRequestOutput.innerText;
        navigator.clipboard.writeText(text).then(function () {
            copyBtn.textContent = 'Copied!';
            copyBtn.classList.add('copied');
            setTimeout(function () {
                copyBtn.textContent = 'Copy to Clipboard';
                copyBtn.classList.remove('copied');
            }, 2000);
        }).catch(function () {
            var range = document.createRange();
            range.selectNodeContents(fundingRequestOutput);
            var sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
        });
    });

    // ===== Edit This Request =====
    editBtn.addEventListener('click', function () {
        state.isEditing = !state.isEditing;
        if (state.isEditing) {
            fundingRequestOutput.setAttribute('contenteditable', 'true');
            fundingRequestOutput.classList.add('editable');
            editBtn.textContent = 'Done Editing';
            fundingRequestOutput.focus();
        } else {
            fundingRequestOutput.removeAttribute('contenteditable');
            fundingRequestOutput.classList.remove('editable');
            editBtn.textContent = 'Edit This Request';
        }
    });

    // ===== Back to Working Page =====
    backBtn.addEventListener('click', function () {
        updateProgress(2);
        renderStep2();
        showSection('step-2');
        step2.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    // ===== Start Over =====
    startOverBtn.addEventListener('click', function () {
        // Reset state
        state.mode = 'draft';
        state.funderName = '';
        state.userInput = '';
        state.detected = {};
        state.funderInfo = {};
        state.answers = {};
        state.notSure = {};
        state.isEditing = false;

        // Reset form
        funderInput.value = '';
        userInputArea.value = '';
        userInputArea.placeholder = placeholders.draft;
        inputHelpText.textContent = helpTexts.draft;
        modeCards.forEach(function (c) { c.classList.remove('active'); });
        modeCards[0].classList.add('active');

        // Reset edit state
        fundingRequestOutput.removeAttribute('contenteditable');
        fundingRequestOutput.classList.remove('editable');

        updateProgress(1);
        showSection('step-1');
        step1.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    // ===== Error Display =====
    function showError(message) {
        loadingMessage.textContent = message;
        loadingSection.querySelector('.spinner').style.display = 'none';
        // Add a "Go Back" button if there isn't one already
        if (!loadingSection.querySelector('.error-back-btn')) {
            var backButton = document.createElement('button');
            backButton.className = 'btn-outline error-back-btn';
            backButton.textContent = 'Go Back';
            backButton.style.marginTop = '20px';
            backButton.addEventListener('click', function () {
                loadingSection.querySelector('.spinner').style.display = '';
                backButton.remove();
                updateProgress(1);
                showSection('step-1');
                step1.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
            loadingSection.querySelector('.loading-content').appendChild(backButton);
        }
    }

    // ===== Utility =====
    function escapeHtml(str) {
        if (!str) return '';
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // Set initial placeholder
    userInputArea.placeholder = placeholders[state.mode];

})();
