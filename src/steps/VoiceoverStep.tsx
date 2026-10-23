interface Props {
  busy: boolean;
  error: string | null;
  onUpload: (file: File) => void;
}

function UploadTab({ busy, error, onUpload }: Props) {
  return (
    <div>
      <label className="upload">
        <span className="btn">⬆ Upload voiceover</span>
        <input
          type="file"
          accept="audio/*"
          aria-label="Upload voiceover"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = ''; // so picking the same file again still fires onChange
            if (file) onUpload(file);
          }}
        />
      </label>
      <p className="hint">WAV, MP3, M4A… up to 3 minutes. Your character will lip-sync to it.</p>
      {error && <p role="alert" className="error">{error}</p>}
    </div>
  );
}

export function VoiceoverStep(props: Props) {
  return (
    <div>
      <h2>Add a voiceover</h2>
      <div className="tabs">
        <button className="tab active">⬆ Upload</button>
        <button className="tab" disabled title="Coming soon">✍ Write script</button>
      </div>
      <UploadTab {...props} />
    </div>
  );
}
