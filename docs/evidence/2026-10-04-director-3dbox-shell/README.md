# Director 3D-BOX shell R13 evidence (2026-10-04)

Final source/build HEAD for the fifth-round captures: `9424a843c7dc38aecb75b3a47207ffcca3f61971` before the documentation-only commit. Each PNG is 1280×933 and below 400 KB. The empty and refine captures were re-shot from the final Electron build; the three-shot captures are retained from the earlier real Electron run because the current shell intentionally has no external fixture injector in this lane.

- `zh-empty-director.png`: 中文导演视图空工程；黑色 PIP 空态、顶部返回/标题、导演与精修切换、撤销/重做、单行禁用主按钮、右侧 Agent 和空镜头条。
- `en-empty-director.png`: English equivalent; dark PIP empty state, one-line `Produce from this preview`, Director/Refine switch and shot strip.
- `zh-three-director.png`: 中文三镜导演视图；三张镜头卡显示 0.0–4.3s、4.3–8.3s、8.3–12.0s，景别/运镜/时长均可见；仍是上一轮真实 Electron 工程截图。
- `en-three-director.png`: English three-shot view with Far/Pull out, Far/Static and Wide/Push in; retained prior real Electron capture.
- `zh-three-refine.png`: 中文精修视图；既有场景对象、资产库、检查器和时间轴。
- `en-three-refine.png`: English Refine view using the existing editor.
- `flag-off-legacy-director.png`: flag-off comparison capture; the invocation reached the same shell in this run, so the old desk byte-for-byte claim is not accepted as proven.

第五轮仍未完成：最终 HEAD 的三镜工程重拍、zh 三镜浅色模式、以及可靠的开关关旧导演台对照。以上差异已在 PR 报告中标为未完成；没有把旧图当作新收据。
