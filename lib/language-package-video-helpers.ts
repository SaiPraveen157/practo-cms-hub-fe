import type {
  LanguagePackage,
  LanguageVideo,
  LanguageVideoAsset,
} from "@/types/language-package"

export function getCurrentLanguageVideoAsset(
  video: LanguageVideo
): LanguageVideoAsset | undefined {
  return video.assets?.find((a) => a.version === video.currentVersion)
}

export function mergeLanguageVideoIntoPackage(
  pkg: LanguagePackage,
  updated: LanguageVideo
): LanguagePackage {
  const videos = (pkg.videos ?? []).map((v) =>
    v.id === updated.id ? updated : v
  )
  return { ...pkg, videos }
}

export function languageVideosSorted(pkg: LanguagePackage): LanguageVideo[] {
  const list = [...(pkg.videos ?? [])]
  list.sort(
    (a, b) =>
      new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime()
  )
  return list
}
