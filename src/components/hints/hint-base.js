/**
 * HintBase - Base class for all hint components
 * 
 * All hint components should extend this class and implement:
 * - static get observedAttributes() - List of observed attributes
 * - render() - Render the component UI
 * 
 * Common features provided:
 * - Shadow DOM for style encapsulation
 * - notifyShown() - Dispatches 'hint-shown' event when hint is displayed
 * 
 * Events:
 * - hint-shown: Fired when hint has finished loading/displaying
 */
export class HintBase extends HTMLElement {
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
   * Notify that hint has been shown
   * Call this after the hint content has loaded/displayed
   */
  notifyShown() {
    this.dispatchEvent(new CustomEvent('hint-shown', {
      bubbles: true,
      composed: true
    }));
  }

  /**
   * Get common styles for hint components
   * @returns {string} CSS styles
   */
  getBaseStyles() {
    return `
      :host {
        display: block;
        font-family: 'Pretendard', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }
      
      .hint-container {
        padding: 0.5rem;
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.1);
      }
      
      .hint-content {
        color: white;
        text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.5);
      }
      
      .hint-text {
        font-size: 1.1rem;
        line-height: 1.5;
      }
      
      .hint-media {
        max-width: 100%;
        border-radius: 8px;
      }
    `;
  }
}
