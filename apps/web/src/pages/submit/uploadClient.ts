import {
  ACCEPTED_UPLOAD_EXTENSIONS,
  API_PATHS,
  apiError,
  UPLOAD_FIELDS,
  type ApiError,
  type SubmissionStatusDto,
} from '@pribe/shared';

export class UploadError extends Error {
  constructor(readonly body: ApiError) {
    super(body.message);
  }
}

/** Client-side pre-check; the server validates again. Returns an error message or `null`. */
export function precheckFile(file: File, maxUploadMb: number): string | null {
  const name = file.name.toLowerCase();
  if (!ACCEPTED_UPLOAD_EXTENSIONS.some((ext) => name.endsWith(ext))) return apiError('UNSUPPORTED_FILE_TYPE').message;
  if (file.size > maxUploadMb * 1024 * 1024) return `Die Datei ist zu groß (max. ${maxUploadMb} MB).`;
  if (file.size === 0) return 'Die Datei ist leer.';
  return null;
}

/** XHR instead of fetch for upload progress; the person comes from the login cookie. */
export function uploadFile(file: File, onProgress: (fraction: number) => void) {
  return new Promise<SubmissionStatusDto>((resolve, reject) => {
    const form = new FormData();
    form.append(UPLOAD_FIELDS.file, file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', API_PATHS.submit.upload);
    xhr.responseType = 'json';
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve(xhr.response as SubmissionStatusDto);
      const body = xhr.response as ApiError | null;
      if (xhr.status === 413 && !body?.error) return reject(new UploadError(apiError('FILE_TOO_LARGE')));
      reject(new UploadError(body?.error ? body : apiError('INTERNAL')));
    };
    xhr.onerror = () => reject(new UploadError(apiError('INTERNAL', 'Keine Verbindung zum Server.')));
    xhr.send(form);
  });
}
