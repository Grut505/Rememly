import { pdfApi } from '../api/pdf'
import { PdfJob } from '../api/types'
import { CONSTANTS } from '../utils/constants'

class PdfService {
  async createPdf(from: string, to: string): Promise<string> {
    const result = await pdfApi.create({ from, to })
    return result.job_id
  }

  async pollJobStatus(
    jobId: string,
    onProgress?: (job: PdfJob) => void
  ): Promise<PdfJob> {
    return new Promise((resolve, reject) => {
      const poll = async () => {
        try {
          const job = await pdfApi.status(jobId)

          if (onProgress) {
            onProgress(job)
          }

          if (job.status === 'DONE') {
            resolve(job)
          } else if (job.status === 'ERROR') {
            reject(new Error(job.error_message || 'PDF generation failed'))
          } else {
            setTimeout(poll, CONSTANTS.PDF_POLL_INTERVAL_MS)
          }
        } catch (error) {
          reject(error)
        }
      }

      poll()
    })
  }
}

export const pdfService = new PdfService()
