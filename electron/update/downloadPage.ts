const DOWNLOAD_PAGE_URL = "https://nomiaqm.com/";

export function buildDownloadPageUrl(platform: NodeJS.Platform, arch: string): string {
  const url = new URL(DOWNLOAD_PAGE_URL);
  url.searchParams.set("download", "1");
  url.searchParams.set("source", "app-update");
  url.searchParams.set("platform", platform);
  url.searchParams.set("arch", arch);
  return url.toString();
}
