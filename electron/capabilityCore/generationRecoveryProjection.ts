import type { GenerationProviderCapabilityProfile } from './generationProviderCapabilities'

export type GenerationRecoveryState =
  | 'submission_unknown'
  | 'cancel_requested'
  | 'cancelled'

export type GenerationRecoveryLocale = 'zh-CN' | 'en'

export type GenerationRecoveryProjection = Readonly<{
  state: GenerationRecoveryState
  profile: GenerationProviderCapabilityProfile
  title: string
  message: string
  nextAction: 'reconcile' | 'manual_review' | 'observe' | 'create_new_attempt'
  allowAutomaticRetry: false
  allowNewAttempt: boolean
  status?: 'detached'
  providerReference?: string
}>

/**
 * Translate provider limitations into one honest, actionable user-facing state.
 * This is deliberately pure: it never decides to call a provider or retry.
 */
export function projectGenerationRecovery(input: {
  state: GenerationRecoveryState
  profile: GenerationProviderCapabilityProfile
  providerReference?: string
  locale?: GenerationRecoveryLocale
}): GenerationRecoveryProjection {
  const providerReference = input.providerReference?.trim() || undefined
  const isEnglish = input.locale === 'en'
  if (input.state === 'submission_unknown') {
    if (input.profile === 'full_recovery') {
      return {
        state: input.state,
        profile: input.profile,
        title: isEnglish ? 'Checking submission' : '正在核对提交结果',
        message: isEnglish
          ? providerReference ? `Nomi is checking provider task ${providerReference}; it will not submit again while checking.` : 'Nomi is checking whether the provider accepted the task; it will not submit again while checking.'
          : providerReference ? `Nomi 正在核对供应商任务 ${providerReference}；确认前不会再次提交。` : 'Nomi 正在核对供应商是否已接受任务；确认前不会再次提交。',
        nextAction: 'reconcile',
        allowAutomaticRetry: false,
        allowNewAttempt: false,
        ...(providerReference ? { providerReference } : {}),
      }
    }
    if (input.profile === 'observe_only') {
      return {
        state: input.state,
        profile: input.profile,
        title: isEnglish ? 'It may already be submitted' : '可能已经提交',
        message: isEnglish
          ? providerReference ? `The provider may have accepted task ${providerReference}; Nomi can keep checking and will not resubmit automatically.` : 'The submission result is uncertain; check the provider before deciding. Nomi will not resubmit automatically.'
          : providerReference ? `供应商任务 ${providerReference} 可能已经接受；Nomi 可以继续查询，不会自动重提。` : '提交结果暂时不确定；请到供应商核对，Nomi 不会自动重提。',
        nextAction: providerReference ? 'reconcile' : 'manual_review',
        allowAutomaticRetry: false,
        allowNewAttempt: true,
        ...(providerReference ? { providerReference } : {}),
      }
    }
    return {
      state: input.state,
      profile: input.profile,
      title: isEnglish ? 'Submission needs checking' : '提交结果需要核对',
      message: isEnglish ? 'The provider may have accepted the task; check with the provider before deciding whether to start a new attempt. Nomi will not resubmit automatically.' : '供应商可能已经接受任务；请先到供应商核对，再决定是否开启新的提交尝试；Nomi 不会自动重提。',
      nextAction: 'manual_review',
      allowAutomaticRetry: false,
      allowNewAttempt: true,
    }
  }

  if (input.state === 'cancel_requested') {
    const remoteMayContinue = input.profile !== 'full_recovery'
    return {
      state: input.state,
      profile: input.profile,
      title: remoteMayContinue ? (isEnglish ? 'Waiting stopped' : '已停止等待') : (isEnglish ? 'Cancelling task' : '正在取消任务'),
      message: remoteMayContinue
        ? (isEnglish ? 'Nomi stopped waiting; the provider task may still be running. Check its final status with the provider.' : 'Nomi 已停止等待；供应商任务可能仍在运行，请到供应商查看最终状态。')
        : (isEnglish ? 'Nomi is checking cancellation with the provider; it will not submit again while checking.' : 'Nomi 正在向供应商确认取消结果；在确认前不会再次提交。'),
      nextAction: 'observe',
      allowAutomaticRetry: false,
      allowNewAttempt: false,
      ...(remoteMayContinue ? { status: 'detached' as const } : {}),
      ...(providerReference ? { providerReference } : {}),
    }
  }

  return {
    state: input.state,
    profile: input.profile,
    title: isEnglish ? 'Stopped' : '已停止',
    message: isEnglish ? 'This generation has stopped; there will be no new automatic submission.' : '这次生成已停止；没有新的自动提交。',
    nextAction: 'create_new_attempt',
    allowAutomaticRetry: false,
    allowNewAttempt: true,
    ...(providerReference ? { providerReference } : {}),
  }
}
