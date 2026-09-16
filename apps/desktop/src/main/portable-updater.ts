import { app } from 'electron';
import electronUpdater from 'electron-updater';
import type { ResolvedUpdateFileInfo } from 'electron-updater';
import type { DownloadUpdateOptions } from 'electron-updater/out/AppUpdater';
import type { ElectronHttpExecutor } from 'electron-updater/out/electronHttpExecutor';
import { preparePortableUpdate, startPortableUpdate } from './portable-update-helper';

export function selectPortableFile(
  files: ResolvedUpdateFileInfo[],
  version: string,
): ResolvedUpdateFileInfo {
  const name = `OpenDeckTracker-${version}-win.zip`;
  const file = files.find(
    (candidate) => decodeURIComponent(candidate.url.pathname).split('/').at(-1) === name,
  );
  if (!file || !file.info.sha512 || !file.info.size)
    throw new Error(
      'This release has no verified Windows portable ZIP. Please open the download page.',
    );
  return file;
}

/** Keep AppUpdater's feed, version policy, cache, checksum and progress handling. */
export class PortableUpdater extends electronUpdater.AppUpdater {
  // Present at runtime in electron-updater 6.8.3, omitted from its declaration file.
  declare readonly httpExecutor: ElectronHttpExecutor;
  private preparedPlan: string | undefined;

  constructor() {
    super(undefined);
  }

  protected async doDownloadUpdate(options: DownloadUpdateOptions): Promise<string[]> {
    this.preparedPlan = undefined;
    const { info, provider } = options.updateInfoAndProvider;
    const fileInfo = selectPortableFile(provider.resolveFiles(info), info.version);
    return this.executeDownload({
      fileExtension: 'zip',
      fileInfo,
      downloadUpdateOptions: options,
      task: (destination, downloadOptions) =>
        this.httpExecutor.download(fileInfo.url, destination, downloadOptions),
      done: async (event) => {
        this.preparedPlan = await preparePortableUpdate(event.downloadedFile, fileInfo.info.sha512);
        this.dispatchUpdateDownloaded(event);
      },
    });
  }

  quitAndInstall(): void {
    if (!this.preparedPlan)
      throw new Error('Portable update has not been prepared. Download it again.');
    void startPortableUpdate(this.preparedPlan)
      .then(() => app.quit())
      .catch((error: unknown) => {
        this.dispatchError(error instanceof Error ? error : new Error(String(error)));
      });
  }
}
