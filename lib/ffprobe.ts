import { execFile } from 'child_process';
import { promisify } from 'util';
import { getFfmpegPath, getFfprobePath } from './binaries';

const execFileAsync = promisify(execFile);

export interface FfprobeResult {
  duration: number | null;
  width: number | null;
  height: number | null;
  format: string | null;
}

export async function probeFile(filePath: string): Promise<FfprobeResult> {
  try {
    const { stdout } = await execFileAsync(
      getFfprobePath(),
      ['-v', 'quiet', '-print_format', 'json', '-show_streams', '-show_format', filePath],
      { timeout: 30000 },
    );

    const data = JSON.parse(stdout) as {
      streams?: { codec_type?: string; width?: number; height?: number }[];
      format?: { duration?: string; format_name?: string };
    };

    const videoStream = data.streams?.find((s) => s.codec_type === 'video');
    const fmt = data.format;

    const rawDuration = fmt?.duration ? parseFloat(fmt.duration) : NaN;
    return {
      duration: !isNaN(rawDuration) ? rawDuration : null,
      width: typeof videoStream?.width === 'number' ? videoStream.width : null,
      height: typeof videoStream?.height === 'number' ? videoStream.height : null,
      format: typeof fmt?.format_name === 'string' ? fmt.format_name.split(',')[0] : null,
    };
  } catch {
    return { duration: null, width: null, height: null, format: null };
  }
}

export async function generateVideoThumbnail(
  videoPath: string,
  outputPath: string,
): Promise<boolean> {
  try {
    await execFileAsync(
      getFfmpegPath(),
      ['-i', videoPath, '-vf', 'thumbnail,scale=720:-1', '-frames:v', '1', '-y', outputPath],
      { timeout: 60000 },
    );
    return true;
  } catch {
    return false;
  }
}
