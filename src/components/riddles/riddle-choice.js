/**
 * N지선다 수수께끼
 * 
 * 사용법:
 *   <riddle-choice 
 *     question="'사과'를 영어로?" 
 *     options='["Banana","Apple","Orange","Grape"]' 
 *     answer-index="1">
 *   </riddle-choice>
 * 
 * 속성:
 *   - question: 문제 텍스트
 *   - options: JSON 배열 형태의 선택지
 *   - answer-index: 정답 인덱스 (0부터 시작)
 * 
 * 이벤트:
 *   - answer-submit: { detail: { answer, correct, feedback } }
 */
import { RiddleBase } from './riddle-base.js';

export class RiddleChoice extends RiddleBase {
  static get observedAttributes() {
    return ['question', 'options', 'answer-index'];
  }

  render() {
    const question = this.getAttribute('question') || '문제가 없습니다';
    let options = [];
    
    try {
      options = JSON.parse(this.getAttribute('options') || '[]');
    } catch (e) {
      console.error('Invalid options JSON:', e);
    }
    
    this.shadowRoot.innerHTML = `
      <style>
        ${this.getBaseStyles()}
        
        .choice-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 0.75rem;
          margin-top: 1rem;
        }
        
        .choice-btn {
          padding: 1rem;
          font-size: 1.1rem;
          font-weight: 600;
          color: #1e293b;
          background: white;
          border: 2px solid #e2e8f0;
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.2s ease;
          min-height: 60px;
          display: flex;
          align-items: center;
          justify-content: center;
          text-align: center;
        }
        
        .choice-btn:hover {
          border-color: #6366f1;
          background: #f8fafc;
        }
        
        .choice-btn:active {
          transform: scale(0.98);
        }
        
        .choice-btn.selected {
          border-color: #6366f1;
          background: #eef2ff;
        }
        
        .choice-btn.correct {
          border-color: #10b981;
          background: #d1fae5;
        }
        
        .choice-btn.wrong {
          border-color: #ef4444;
          background: #fee2e2;
        }
        
        .choice-number {
          width: 24px;
          height: 24px;
          background: #e2e8f0;
          color: #64748b;
          border-radius: 50%;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 0.8rem;
          margin-right: 0.5rem;
          flex-shrink: 0;
        }
        
        @media (max-width: 400px) {
          .choice-grid {
            grid-template-columns: 1fr;
          }
        }
      </style>
      
      <div class="riddle-container">
        <div class="riddle-question">${question}</div>
        <div class="choice-grid">
          ${options.map((opt, i) => `
            <button class="choice-btn" data-index="${i}">
              <span class="choice-number">${i + 1}</span>
              <span>${opt}</span>
            </button>
          `).join('')}
        </div>
      </div>
    `;
    
    // Add click handlers to all buttons
    this.shadowRoot.querySelectorAll('.choice-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const index = parseInt(btn.dataset.index);
        this.submitAnswer(index);
      });
    });
  }

  validate(selectedIndex) {
    const answerIndex = parseInt(this.getAttribute('answer-index') || '0');
    const correct = selectedIndex === answerIndex;
    
    // Highlight the selected button
    const buttons = this.shadowRoot.querySelectorAll('.choice-btn');
    buttons.forEach((btn, i) => {
      btn.classList.remove('selected', 'correct', 'wrong');
      if (i === selectedIndex) {
        btn.classList.add(correct ? 'correct' : 'wrong');
      }
      if (!correct && i === answerIndex) {
        // Show correct answer after a delay
        setTimeout(() => btn.classList.add('correct'), 500);
      }
    });
    
    return {
      correct,
      feedback: correct ? '정답이에요! 🎉' : '아쉬워요! 다시 도전해봐요! 💪'
    };
  }
}

customElements.define('riddle-choice', RiddleChoice);
