/** Shell commands that the agent runs on its own machine to send a file in chunks. */

export const CHUNK_SIZE = 52428800;
export const MAX_UPLOAD_BYTES = 314572800;

const SUFFIX_LENGTH = 3;
const CURL = 'curl -sS --fail-with-body';

/** Makes one literal POSIX shell argument: wrap in single quotes, and change each ' to '\''. */
export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** The file name suffix that `split -a 3` gives to part `index`: 0 → 'aaa', 1 → 'aab', 26 → 'aba'. */
export function splitSuffix(index: number): string {
  let rest = index;
  let suffix = '';
  for (let i = 0; i < SUFFIX_LENGTH; i++) {
    suffix = String.fromCharCode(97 + (rest % 26)) + suffix;
    rest = Math.floor(rest / 26);
  }
  return suffix;
}

/** A name that starts with '-' would be read as an option (and '@-' as stdin), so give it a './' prefix. */
function localPath(filename: string): string {
  return filename.startsWith('-') ? `./${filename}` : filename;
}

/** curl -F reads ';' and ',' after '@' as separators. curl's own double quotes keep the name whole. */
function curlFormFile(file: string): string {
  return /[;,"\\]/.test(file) ? `"${file.replace(/[\\"]/g, '\\$&')}"` : file;
}

function curlCommand(url: string, token: string, file: string): string {
  const form = `chunk=@${curlFormFile(file)}`;
  return `${CURL} -X POST ${shellQuote(url)} -H ${shellQuote(`X-Upload-Token: ${token}`)} -F ${shellQuote(form)}`;
}

/** One prefix for each upload, so two uploads in the same folder do not share part files. */
function partPrefix(uploadId: string): string {
  // The uploadId is a server UUID. Keep only letters and digits, because the prefix is not quoted.
  return `jeu_${uploadId.replace(/[^0-9a-z]/gi, '').slice(0, 8)}_`;
}

export function buildUploadCommands(p: {
  chunkUrlBase: string;
  uploadId: string;
  token: string;
  filename: string;
  totalChunks: number;
}): string[] {
  if (p.totalChunks === 1) {
    return [curlCommand(`${p.chunkUrlBase}/0`, p.token, localPath(p.filename))];
  }
  const prefix = partPrefix(p.uploadId);
  const commands = [`split -b ${CHUNK_SIZE} -a ${SUFFIX_LENGTH} ${shellQuote(localPath(p.filename))} ${prefix}`];
  for (let i = 0; i < p.totalChunks; i++) {
    commands.push(curlCommand(`${p.chunkUrlBase}/${i}`, p.token, `${prefix}${splitSuffix(i)}`));
  }
  commands.push(`rm -f ${prefix}*`);
  return commands;
}
