# 🔧LibTV skill  使用指南.docx
## 文档元数据
```json
{
  "source": "/Users/aoqimin/Downloads/🔧LibTV skill  使用指南.docx",
  "size_bytes": 13189014,
  "mtime": 1787520658.7916598,
  "title": "",
  "author": "Apache POI",
  "created": "2026-08-23 21:30:46+00:00",
  "modified": "None",
  "paragraph_count": 66,
  "table_count": 6,
  "media_count": 9,
  "elapsed_sec": 0.05
}
```
## 正文（按 DOCX 段落顺序）
P0: 🔧LibTV skill  使用指南
P1: 新版 LibTV skill
P4: 老版 LibTV skill
P5: 🚀 🚀 🚀  让你的🦞开启 LibTV Skill之旅 🚀 🚀 🚀
P7: 嗨，亲爱的创作者！欢迎加入 LibTV 的魔法世界🥳 这里有超简单的入门指南，帮你快速解锁 AI 创作新玩法！
P9: 🔧 第一步：搞定 OpenClaw  / 飞书插件 / KimiClaw
P10: 要开始创作，你需要先拥有以下任意一个工具：
P11: 本地运行的 OpenClaw  【推荐】
P12: 飞书官方插件版  OpenClaw @飞书 【推荐】
P13: 或者基于 OpenClaw 规范的 KimiClaw 等衍生平台。
P14: 还没安装？别慌！这里有超详细的安装秘籍👇
P15: ✅ 飞书官方教程 ：墙裂推荐阅读《OpenClaw 飞书官方插件上线｜一文讲清功能、安装更新教程与常见问题！》，跟着步骤一步步操作，轻松搞定 OpenClaw 本体和飞书插件安装。
P16: ✅ 官方安装脚本 / 文档 ：入门指南 - OpenClaw
P17: 等你完成任意一个工具的安装，就可以进入下一步的 LibTV Skill配置啦！
P19: 🛠️ 第二步：获取libtv-skills
P20: 这里有两种超便捷的安装方式，选你最爱的就好😎
P21: GitHub 直达 ：直接冲官方仓库libtv-labs/libtv-skills，里面的 README 文件有详细的npx skills add一键安装和手动安装教程，小白也能轻松上手！
P22: ClawHub 平台一键安装 ：打开 ClawHub Skill页LibTV API Skills，跟着页面提示点一点，就能把Skill直接安装到你的 OpenClaw 环境里，简直不要太方便！
P23: [libtv-skill-v0.0.3.zip]
P26: 📂 第三步：安装libtv-skill
P27: 拿到skill文件后，请解压到对应的~/.openclaw/skills/目录，即可调用！
P29: 🔑 第四步：授权登录LibTV
P30: 要让libtv-skill正常工作，还需要神秘密码access_key，跟着下面的步骤操作，轻松完成配置！
P32: 🎁 获取access_key
P33: 3.18 正式发布后（全民可享） ：直接去 Liblib.TV 官网登录账号，把鼠标移到右上角头像，在账户 / 设置区域就能找到并复制你的access_key啦！
P34: ⚙️ 配置access_key
P35: 拿到密钥后，有两种简单的配置方式任你选，配置完成则是🦞完成了LibTV的登录。
P36: 对话式授权 ：直接把你的access_key发给 OpenClaw（比如在和 OpenClaw 的对话里按照提示操作），收到「key 已添加」的确认消息，就说明你已经完成 LibTV 登录授权。
P37: 环境变量设置：直接设置环境变量，然后重启相关进程，libtv-skill就会自动用这个密钥访问 LibTV 。
P38: 输入指令 ：
P40: 注意，创作过程使用的算力均为你的access_key对应的账号算力哦～ 请为skill准备充足的“口粮”
P42: 🎬 第五步：开始创作【必看】
P43: 一切准备就绪，现在就可以开始创作啦！跟着下面的步骤，轻松生成精彩内容！
P45: 说出你的创作想法 ：
P46: 在 OpenClaw 里直接发消息，比如：帮我做一个《寻秦记》的漫剧！OpenClaw 会立刻调用 LibTV 创建会话，把你的创作指令传达出去！
P48: 坐等成果出炉 ：LibTV 收到指令后就会开始生成图片 / 视频，完成后在对话中返回：
P49: 可以直接播放的成片视频链接
P50: 对应的 LibTV project链接  点击可查看整个创作过程【 整个工作流过程需要在结果完成后进行返回 】
P51: “如果老师们遇到没有把工作流过程放在画布上，那么可以询问🦞，“请确认是否把整个生成工作流创建在了画布上？”“如果没有🦞会进行重试，或者你可以要求重新创建在画布！”
P52: 对话指令复制👉“重试创建整个工作流放在画布”
P54: 提供参考图片/视频
P55: 如果是本地的openclaw，请把需要参考的视频/图片的路径发给openclaw
P56: 如果是飞书的clawbot，请打开你的飞书🦞对应的应用设置，开发上传权限后，发送参考图片/视频即可
P58: 随时追踪创作进度 ：
P59: 想知道任务做到哪一步了？可以直接在对话里问：现在进度怎么样啦？或用具体的sessionId/project ID精准查询。
P60: Tips：要是不想干等，还可以说：「每隔 20 秒跟我汇报一次进度！」，让 Agent 实时给你反馈状。
P62: 开启新的创作画布 ：
P63: 默认情况下，所有任务都会在同一个 LibTV 画布项目里进行。可以直接说“开启新项目”，或者输入指令 create_session ，新开项目将不会保留之前项目的上下文。
P65: 问题排查：
P66: 如果出现了生成任务卡住或者失败，请询问你的龙虾，给我这次生成任务的sessionId，拿到后可以向官方联 系和反馈。
P69: 🤩 效果showcase
P71: ❓ 常见问题大揭秘！
P72: 模型调用失败了怎么办？
P73: 有些模型只对 LibTV 会员开放，建议优先使用会员账号绑定的access_key；
P74: 也有可能是模型厂商那边不稳定，LibTV 会自动重试；如果多次失败，别急，过一会儿再试试说不定就好了！
P75: 算力怎么扣？失败了会浪费吗？
P76: 调用模型用的是你提供的access_key对应 LibTV 账号的算力；
P77: 失败的任务不会扣除算力，要是出现误扣，系统也会自动返还给你，完全不用担心！
P78: 生成结果出来了，但是没有放在画布上怎么办？
P79: 直接和龙虾说“把全部工作流和结果都放在画布上”
P80: 由于不同模型能力差异，也建议自查龙虾的基础模型。推荐使用更强的模型见上方模型推荐。
P81: 放在画布上了，但是只有空节点怎么办
P82: 直接和龙虾说“你的节点是空的，重新创建工作流，要把结果也放到节点里”
P84: 💬 联系我们
P85: 更多问题，前往liblib.TV 联系我们，或加入用户交流群
P89: 全文评论
## 表格
### Table 0
| 原 LibTV skill 现已升级为 LibTV CLI，请移至新页面和使用指南
LibTV CLI 官网
LibTV CLI 使用指南 |
### Table 1
| 版本更新说明
更新时间：2026.4.2 00:00
更新信息：
支持skill 调用 seedance 2.0进行视频生成，支持仿真人人像生成
默认视频生成为 seedance 2.0，也支持要求使用kling O3/3.0生成

修复了无法放在画布上的问题，优化了节点放置画布的时间，支持生成中查看节点
优化了无法视频编辑的问题
优化了图生视频/首帧生视频不一致的问题

更多方向skills、更稳定的能力、更惊艳的效果均在持续迭代中  ⛽️⛽️  🫡🫡🫡🫡 |
### Table 2
|  |  |
### Table 3
| YAML
 export LIBTV_ACCESS_KEY="your-access-key" |
### Table 4
| 重要提示❤️❤️
不同的龙虾由于部署环境差异大，可能出现不同的情况，推荐大家尽量使用本地部署官方openclaw，或者飞书的clawbot，或其他稳定的平台
不同龙虾吃的语言模型不同，对skill的理解会有偏差，推荐大家使用GPT5.4、Claude 4.6、Gemini3.1、GLM5、Kimi2.5 等模型，不支持多模态理解的模型无法使用此skills。
一般1分钟视频生成时长在15-30分钟，如遇高峰时间，视频生成时间可能更长（比如1小时），建议尽量控制视频在3分钟内，因此请大家发出任务后，确认已经回答了基础问题，就可以后台等待了，待30分钟后回来验收成果。 |
### Table 5
| 类别 | Case | 输入信息 | 结果展示 |
| 短漫剧Skill | 动画短片
《赛博青蛙》 | 给我一个30秒的漫剧，讲述《井底之蛙》ai版 | 项目链接：
https://www.liblib.tv/detail/8be596b0f6d34fffa3a6fcd77bce006c

成片展示
[最终成片.mp4] |
| 短漫剧Skill | 动画短片
《狐假虎威》 | 给我一个30秒的漫剧，讲述《狐假虎威》打工人版 | 项目链接
https://www.liblib.tv/detail/3cfcb3b26df74b8a920886bd52641452

成片展示
[最终成片 (2).mp4] |
| 爆款视频复刻Skill | 产品广告片复刻 | Prompt ：能复刻这个视频,给我的产品Lib耳机做一个宣传片吗?
[01e6a744039bde420103760390fd8558b1_4610.mp4video.MP4]
[图片节点 4.png] | 项目链接：https://www.liblib.tv/projectDetail/739f9a645b51415ab5fbeeb7c39a4a19


视频成片：
[3月16日.mp4] |
| 音乐MV生成
（还未完全稳定，调试中） | 音乐MV | Prompt ：根据坂本龙一《Rain》音乐，做一个MV视频 | 项目链接：https://www.liblib.tv/projectDetail/2c2f0d125c594fad9ae6eca538861bdb

视频成片：
[81e9a1f74b4bce5f316df352264bfe6fc0eb960a.MP4]
「case来源@作者：Fine」 |
| More（coming soon） |  |  |  |
## 内嵌媒体清单
| path | size | sha256 |
|---|---:|---|
| word/media/image1.png | 2257447 | 6deb6a11023c7a7ac52f62d682498510f2b262073d32b5d4c41fc1ea3703c53b |
| word/media/image2.png | 368330 | 6c8088290079944ab389cc8f4041ac6e9976117723851d23984b1a7065de3f52 |
| word/media/image3.jpeg | 329788 | c7bd88dd17bb193373f3aa1825178cfc878cfdd52ef601f25df75d51f8f3729a |
| word/media/image4.png | 790428 | 9211619608e7555b199be0e5adee3ce06fc1603b40da337b77ea425876d14f16 |
| word/media/image5.png | 2418858 | 59b674e5e0ea7fee469f9a33195c440a4e9ddfd6b5a124f398f5aa95ee746f35 |
| word/media/image6.png | 2074908 | 9c8854030617015bf9bbe4e7468e4918eb1c9091f0a43ae5298bff4d6308c8c4 |
| word/media/image7.png | 3147795 | 76cd26a66a3f6296d25a685519872703d5a2c23c7fb13a7869636a7764842726 |
| word/media/image8.png | 2202692 | bea7221996148954b3fdef0395cb38e9d214cae7b94b3405f858430fcf1e20ea |
| word/media/image9.png | 23848 | 26d2ada54d3e4b93d805509a0bff5d3039deee323be89ecf681631249d179ebd |
