# Director 3D-BOX shell R13 evidence (2026-10-04)

The checked-in PNGs are the existing Playwright/Electron evidence set from the third-round build. They remain 1280×933 and under 400 KB. The fourth-round source fixes are in commit `cbd28023cfd3d583573665ac4e5ccd968eaff5470`; the startup regression was re-run independently against that build (three flag-off runs passed).

- `zh-empty-director.png`: 中文空工程导演视图；画布区导演壳、右侧 Agent、顶部四簇、禁用主按钮和空镜头条。
- `zh-three-director.png`: 中文三镜导演视图；底部三张只读镜头卡和实测时长。
- `zh-three-refine.png`: 中文精修视图；沿用既有对象、资产、检查器和时间轴。
- `en-empty-director.png`: English empty Director view with the existing Agent pane and empty shot strip.
- `en-three-director.png`: English three-shot Director view with three measured cards.
- `en-three-refine.png`: English Refine view using the existing editor.
- `flag-off-legacy-director.png`: flag-off legacy Director desk comparison.

第四轮要求的六张同一最终构建重拍（含 zh 三镜 light mode）尚未完成，因此本目录不能作为第四轮截图已完成的证明；旧图中 PIP 空态和英文 `static` 仍可能反映修复前画面。代码门岗已确认 PIP 使用 `--nomi-media-veil`，中英文运镜词汇由同一表提供。
