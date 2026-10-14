/**
 * Sentiment Pulse - Import & Export Controller (imports.js)
 * Handles CSV drag-and-drop uploads, validation, chunked batch execution,
 * job status polling, and sanitized CSV exports.
 */

const ImportsController = {
  selectedFile: null,
  pollingInterval: null,

  init() {
    this.bindEvents();
  },

  bindEvents() {
    const dropZone = document.getElementById('import-dropzone');
    const fileInput = document.getElementById('import-file-input');
    const selectFileBtn = document.getElementById('import-select-btn');
    const uploadBtn = document.getElementById('import-submit-btn');
    const cancelBtn = document.getElementById('import-cancel-btn');
    const exportBtn = document.getElementById('import-export-btn');

    if (selectFileBtn && fileInput) {
      selectFileBtn.addEventListener('click', () => fileInput.click());
    }

    if (fileInput) {
      fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
          this.handleFileSelected(e.target.files[0]);
        }
      });
    }

    if (dropZone) {
      ['dragenter', 'dragover'].forEach((eventName) => {
        dropZone.addEventListener(eventName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          dropZone.classList.add('drag-active');
        });
      });

      ['dragleave', 'drop'].forEach((eventName) => {
        dropZone.addEventListener(eventName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          dropZone.classList.remove('drag-active');
        });
      });

      dropZone.addEventListener('drop', (e) => {
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
          this.handleFileSelected(e.dataTransfer.files[0]);
        }
      });
    }

    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => this.clearSelection());
    }

    if (uploadBtn) {
      uploadBtn.addEventListener('click', () => this.startUpload());
    }

    if (exportBtn) {
      exportBtn.addEventListener('click', async () => {
        try {
          window.showToast('Generating sanitized CSV export...', 'info');
          await window.api.exportCSV();
          window.showToast('CSV export downloaded successfully!', 'success');
        } catch (err) {
          window.showToast(err.message || 'Export failed.', 'error');
        }
      });
    }
  },

  handleFileSelected(file) {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      window.showToast('Only CSV (.csv) files are supported.', 'error');
      return;
    }

    const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
    if (file.size > MAX_SIZE) {
      window.showToast(
        `File size (${(file.size / (1024 * 1024)).toFixed(1)}MB) exceeds 5MB limit.`,
        'error'
      );
      return;
    }

    this.selectedFile = file;

    const fileMeta = document.getElementById('import-file-meta');
    const fileName = document.getElementById('import-file-name');
    const fileSize = document.getElementById('import-file-size');
    const promptZone = document.getElementById('import-prompt-zone');
    const uploadBtn = document.getElementById('import-submit-btn');

    if (fileName) fileName.textContent = file.name;
    if (fileSize) fileSize.textContent = `${(file.size / 1024).toFixed(1)} KB`;
    if (fileMeta) fileMeta.classList.remove('hidden');
    if (promptZone) promptZone.classList.add('hidden');
    if (uploadBtn) uploadBtn.disabled = false;
  },

  clearSelection() {
    this.selectedFile = null;
    const fileInput = document.getElementById('import-file-input');
    const fileMeta = document.getElementById('import-file-meta');
    const promptZone = document.getElementById('import-prompt-zone');
    const uploadBtn = document.getElementById('import-submit-btn');

    if (fileInput) fileInput.value = '';
    if (fileMeta) fileMeta.classList.add('hidden');
    if (promptZone) promptZone.classList.remove('hidden');
    if (uploadBtn) uploadBtn.disabled = true;
  },

  async startUpload() {
    if (!this.selectedFile) return;

    const uploadBtn = document.getElementById('import-submit-btn');
    const statusCard = document.getElementById('import-status-card');
    const progressText = document.getElementById('import-progress-status');
    const progressBar = document.getElementById('import-progress-bar');
    const resultSummary = document.getElementById('import-result-summary');

    if (uploadBtn) uploadBtn.disabled = true;
    if (statusCard) statusCard.classList.remove('hidden');
    if (progressText) progressText.textContent = 'Uploading CSV file to server...';
    if (progressBar) progressBar.style.width = '20%';
    if (resultSummary) resultSummary.classList.add('hidden');

    try {
      const job = await window.api.uploadCSV(this.selectedFile);
      this.clearSelection();

      if (job.status === 'COMPLETED') {
        this.renderJobSuccess(job);
      } else if (job.status === 'FAILED') {
        this.renderJobFailure(job);
      } else {
        // Poll job status until terminal state
        this.pollJob(job.id);
      }
    } catch (err) {
      console.error('Import upload error:', err);
      if (progressText) progressText.textContent = `Upload error: ${err.message}`;
      if (progressBar) progressBar.style.width = '0%';
      window.showToast(err.message || 'CSV upload failed.', 'error');
      if (uploadBtn) uploadBtn.disabled = false;
    }
  },

  pollJob(jobId) {
    const progressText = document.getElementById('import-progress-status');
    const progressBar = document.getElementById('import-progress-bar');

    clearInterval(this.pollingInterval);
    this.pollingInterval = setInterval(async () => {
      try {
        const job = await window.api.getImportJob(jobId);
        const processed = job.processed_rows || 0;
        const total = job.total_rows || 1;
        const pct = Math.min(Math.round((processed / total) * 100), 95);

        if (progressBar) progressBar.style.width = `${pct}%`;
        if (progressText)
          progressText.textContent = `Processing records (${processed} / ${total})...`;

        if (job.status === 'COMPLETED' || job.status === 'FAILED') {
          clearInterval(this.pollingInterval);
          if (progressBar) progressBar.style.width = '100%';
          if (job.status === 'COMPLETED') {
            this.renderJobSuccess(job);
          } else {
            this.renderJobFailure(job);
          }
        }
      } catch (err) {
        clearInterval(this.pollingInterval);
        if (progressText) progressText.textContent = `Polling error: ${err.message}`;
      }
    }, 1500);
  },

  renderJobSuccess(job) {
    const progressText = document.getElementById('import-progress-status');
    const resultSummary = document.getElementById('import-result-summary');
    const totalCount = document.getElementById('import-stat-total');
    const successCount = document.getElementById('import-stat-success');
    const failCount = document.getElementById('import-stat-failed');
    const errorBox = document.getElementById('import-error-box');

    if (progressText) progressText.textContent = 'Import Job Completed Successfully!';
    if (totalCount) totalCount.textContent = job.total_rows;
    if (successCount) successCount.textContent = job.successful_rows;
    if (failCount) failCount.textContent = job.failed_rows;

    if (errorBox) {
      if (job.error_summary) {
        try {
          const errors = JSON.parse(job.error_summary);
          errorBox.innerHTML = errors.map((e) => `<li>${window.escapeHtml(e)}</li>`).join('');
          errorBox.classList.remove('hidden');
        } catch {
          errorBox.classList.add('hidden');
        }
      } else {
        errorBox.classList.add('hidden');
      }
    }

    if (resultSummary) resultSummary.classList.remove('hidden');
    window.showToast(`Imported ${job.successful_rows} feedback records!`, 'success');

    // Notify Explorer and Overview to refresh
    window.dispatchEvent(new CustomEvent('feedback-created'));
  },

  renderJobFailure(job) {
    const progressText = document.getElementById('import-progress-status');
    const resultSummary = document.getElementById('import-result-summary');
    const errorBox = document.getElementById('import-error-box');

    if (progressText) progressText.textContent = 'Import Job Failed.';
    if (errorBox) {
      let errors = ['The server was unable to parse or process the CSV file.'];
      if (job.error_summary) {
        try {
          errors = JSON.parse(job.error_summary);
        } catch {}
      }
      errorBox.innerHTML = errors.map((e) => `<li>${window.escapeHtml(e)}</li>`).join('');
      errorBox.classList.remove('hidden');
    }
    if (resultSummary) resultSummary.classList.remove('hidden');
    window.showToast('Import job failed. Please inspect error log.', 'error');
  },
};

window.ImportsController = ImportsController;
