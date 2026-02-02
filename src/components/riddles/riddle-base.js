/**
 * RiddleBase - Base class for all riddle components
 * 
 * All riddle components should extend this class and implement:
 * - static get observedAttributes() - List of observed attributes
 * - render() - Render the component UI
 * - validate(answer) - Validate the user's answer
 * 
 * Common features provided:
 * - Shadow DOM for style encapsulation
 * - submitAnswer(answer) - Dispatches 'answer-submit' event
 * - showFeedback(correct, message) - Shows feedback UI
 * 
 * Events:
 * - answer-submit: { detail: { answer, correct, feedback } }
 */
export class RiddleBase extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  /**
   * Observed attributes (override in subclass)
   */
  static get observedAttributes() {
    return [];
  }

  /**
   * Called when attribute changes
   */
  attributeChangedCallback(name, oldVal, newVal) {
    if (oldVal !== newVal) {
      this.render();
    }
  }

  /**
   * Called when element is added to DOM
   */
  connectedCallback() {
    this.render();
  }

  /**
   * Render the component (override in subclass)
   */
  render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          font-family: inherit;
        }
      </style>
      <div>Override render() in subclass</div>
    `;
  }

  /**
   * Submit answer - validates and dispatches event
   * @param {any} answer - The user's answer
   */
  submitAnswer(answer) {
    const result = this.validate(answer);
    
    this.dispatchEvent(new CustomEvent('answer-submit', {
      detail: {
        answer,
        correct: result.correct,
        feedback: result.feedback
      },
      bubbles: true,
      composed: true
    }));

    this.showFeedback(result.correct, result.feedback);
  }

  /**
   * Validate answer (override in subclass)
   * @param {any} answer - The user's answer
   * @returns {{ correct: boolean, feedback: string }}
   */
  validate(answer) {
    return {
      correct: false,
      feedback: 'validate() not implemented'
    };
  }

  /**
   * Show feedback UI
   * @param {boolean} correct - Whether answer was correct
   * @param {string} message - Feedback message
   */
  showFeedback(correct, message) {
    // Remove existing feedback
    this.shadowRoot.querySelector('.riddle-feedback')?.remove();

    const feedbackEl = document.createElement('div');
    feedbackEl.className = `riddle-feedback ${correct ? 'correct' : 'wrong'}`;
    feedbackEl.textContent = message;
    
    // Add feedback styles if not present
    if (!this.shadowRoot.querySelector('#feedback-styles')) {
      const style = document.createElement('style');
      style.id = 'feedback-styles';
      style.textContent = `
        .riddle-feedback {
          padding: 0.75rem 1rem;
          margin-top: 1rem;
          border-radius: 8px;
          font-weight: 600;
          text-align: center;
          animation: fadeIn 0.3s ease;
        }
        .riddle-feedback.correct {
          background: #d1fae5;
          color: #065f46;
        }
        .riddle-feedback.wrong {
          background: #fee2e2;
          color: #991b1b;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `;
      this.shadowRoot.appendChild(style);
    }

    this.shadowRoot.appendChild(feedbackEl);
  }

  /**
   * Get common styles for riddle components
   * @returns {string} CSS styles
   */
  getBaseStyles() {
    return `
      :host {
        display: block;
        font-family: 'Pretendard', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }
      
      .riddle-container {
        padding: 1rem;
      }
      
      .riddle-question {
        font-size: 1.5rem;
        font-weight: 600;
        margin-bottom: 1.5rem;
        line-height: 1.4;
        color: #1e293b;
      }
      
      .riddle-input {
        width: 100%;
        padding: 1rem;
        font-size: 1.25rem;
        border: 2px solid #e2e8f0;
        border-radius: 12px;
        transition: border-color 0.2s ease;
      }
      
      .riddle-input:focus {
        outline: none;
        border-color: #6366f1;
      }
      
      .riddle-submit {
        width: 100%;
        padding: 1rem;
        margin-top: 1rem;
        font-size: 1.25rem;
        font-weight: 600;
        color: white;
        background: #10b981;
        border: none;
        border-radius: 12px;
        cursor: pointer;
        transition: background 0.2s ease;
      }
      
      .riddle-submit:hover {
        background: #059669;
      }
      
      .riddle-submit:active {
        transform: scale(0.98);
      }
    `;
  }
}
