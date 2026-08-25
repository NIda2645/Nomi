import { IconMessageCircle, IconMusic, IconPhoto, IconVideo } from '@tabler/icons-react'

export const KIND_CAPS = [
  { kind: 'image', labelKey: 'onboardingProviders.drawer.kind.image', Icon: IconPhoto },
  { kind: 'video', labelKey: 'onboardingProviders.drawer.kind.video', Icon: IconVideo },
  { kind: 'text', labelKey: 'onboardingProviders.drawer.kind.text', Icon: IconMessageCircle },
  { kind: 'audio', labelKey: 'onboardingProviders.drawer.kind.audio', Icon: IconMusic },
] as const

export const DREAMINA_CONNECTION_KEY = 'dreamina-member'
