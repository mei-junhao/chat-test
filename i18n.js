/* ============================================================
 * i18n.js  —  全站多语言引擎（中文 / English / Português）
 * ------------------------------------------------------------
 * 功能：
 *  1. 顶部左侧固定「language」按钮（标签恒为 language，不随语言变化）
 *  2. 点击弹出语言选择层（中文 / English / Português）
 *  3. 选择后：保存到 localStorage(siteLang)，用所选语言弹确认框
 *     （说明之后所有回答都会用该语言），并即时刷新页面界面文案
 *  4. 跨页记忆：任意页面读取同一 siteLang
 *  5. 暴露 window.SITE_LANG / window.LANG_INSTRUCTION() 供
 *     各对话页把「回答语言」注入系统提示词，使 AI 按所选语言回答
 *
 * 用法：
 *  - 页面 <head> 引入 <script src="i18n.js"></script>
 *  - 需翻译的静态元素加 data-i18n="key" / data-i18n-ph="key"(占位符)
 *    / data-i18n-html="key"(富文本)
 *  - 动态字符串用 window.T('key') 取值
 * ============================================================ */
(function () {
  'use strict';

  var STORE_KEY = 'siteLang';
  var LANGS = ['zh', 'en', 'pt'];
  var LANG_LABEL = { zh: '中文', en: 'English', pt: 'Português' };

  /* ---------- 三语字典 ---------- */
  var DICT = {
    /* ===== 通用 / 语言开关 ===== */
    lang_switch_title: { zh: '选择语言', en: 'Choose language', pt: 'Escolher idioma' },
    lang_confirm_title: { zh: '语言已切换', en: 'Language switched', pt: 'Idioma alterado' },
    lang_confirm_body_zh: { zh: '已切换为中文。之后所有的回答都将使用中文，你也可以直接用中文提问。', en: '已切换为中文。之后所有的回答都将使用中文，你也可以直接用中文提问。', pt: '已切换为中文。之后所有的回答都将使用中文，你也可以直接用中文提问。' },
    lang_confirm_body_en: { zh: 'Switched to English. All answers will now be in English. You can also ask your questions in English.', en: 'Switched to English. All answers will now be in English. You can also ask your questions in English.', pt: 'Switched to English. All answers will now be in English. You can also ask your questions in English.' },
    lang_confirm_body_pt: { zh: 'Alterado para Português. Todas as respostas serão em Português a partir de agora. Você também pode fazer as suas perguntas em português.', en: 'Alterado para Português. Todas as respostas serão em Português a partir de agora. Você também pode fazer as suas perguntas em português.', pt: 'Alterado para Português. Todas as respostas serão em Português a partir de agora. Você também pode fazer as suas perguntas em português.' },
    lang_confirm_ok: { zh: '好的', en: 'OK', pt: 'OK' },
    ui_close: { zh: '关闭', en: 'Close', pt: 'Fechar' },
    ui_back: { zh: '返回', en: 'Back', pt: 'Voltar' },
    ui_cancel: { zh: '取消', en: 'Cancel', pt: 'Cancelar' },
    ui_confirm: { zh: '确认', en: 'Confirm', pt: 'Confirmar' },
    ui_send: { zh: '发送', en: 'Send', pt: 'Enviar' },

    /* ===== 首页 index.html ===== */
    idx_title: { zh: '与更多大师对话', en: 'Talk with More Masters', pt: 'Converse com Mais Mestres' },
    idx_sub: { zh: '选择一个精神分析大师开始对话', en: 'Choose a psychoanalytic master to begin', pt: 'Escolha um mestre da psicanálise para começar' },
    idx_local_notice: {
      zh: '<strong style="color:var(--accent);">👉 这是我做的本地咨询管理工具</strong> —— 数据全部存在你自己的电脑里，不上传任何云端。点下面卡片右侧的「对这个项目的介绍」即可在线预览网页版。',
      en: '<strong style="color:var(--accent);">👉 A local case-management tool I built</strong> —— all data stays on your own computer, nothing is uploaded to any cloud. Tap “About this project” on the right of the card below to preview the web version.',
      pt: '<strong style="color:var(--accent);">👉 Uma ferramenta local de gestão de casos que criei</strong> —— todos os dados ficam no seu próprio computador, nada é enviado para a nuvem. Toque em “Sobre este projeto” à direita do cartão abaixo para pré-visualizar a versão web.'
    },
    idx_mirror_name: { zh: '心镜 · 本地咨询个案管理系统', en: 'MindMirror · Local Case Management System', pt: 'MindMirror · Sistema Local de Gestão de Casos' },
    idx_mirror_desc: { zh: '纯本地、数据不出本机的咨询工作流（网页预览版）', en: 'Fully local counseling workflow, data never leaves your device (web preview)', pt: 'Fluxo de aconselhamento totalmente local, os dados nunca saem do seu dispositivo (pré-visualização web)' },
    idx_mirror_link: { zh: '对这个项目的介绍 →', en: 'About this project →', pt: 'Sobre este projeto →' },

    idx_m_winnicott_name: { zh: '温尼科特 / 拉康', en: 'Winnicott / Lacan', pt: 'Winnicott / Lacan' },
    idx_m_winnicott_desc: { zh: '客体关系理论 · 足够好的母亲 · 过渡客体', en: 'Object relations · Good-enough mother · Transitional object', pt: 'Relações objetais · Mãe suficientemente boa · Objeto transicional' },
    idx_m_freud_name: { zh: '弗洛伊德', en: 'Freud', pt: 'Freud' },
    idx_m_freud_desc: { zh: '精神分析奠基人 · 无意识 · 释梦 · 俄狄浦斯情结', en: 'Founder of psychoanalysis · The unconscious · Dream interpretation · Oedipus complex', pt: 'Fundador da psicanálise · O inconsciente · Interpretação dos sonhos · Complexo de Édipo' },
    idx_m_klein_name: { zh: '克莱因', en: 'Klein', pt: 'Klein' },
    idx_m_klein_desc: { zh: '客体关系 · 偏执-分裂位 · 抑郁位 · 投射性认同', en: 'Object relations · Paranoid-schizoid position · Depressive position · Projective identification', pt: 'Relações objetais · Posição esquizoparanoide · Posição depressiva · Identificação projetiva' },
    idx_m_jung_name: { zh: '荣格', en: 'Jung', pt: 'Jung' },
    idx_m_jung_desc: { zh: '分析心理学 · 集体无意识 · 原型 · 心理类型', en: 'Analytical psychology · Collective unconscious · Archetypes · Psychological types', pt: 'Psicologia analítica · Inconsciente coletivo · Arquétipos · Tipos psicológicos' },
    idx_m_bion_name: { zh: '比昂', en: 'Bion', pt: 'Bion' },
    idx_m_bion_desc: { zh: '容器与容纳 · α功能 · O · 无记忆无欲望 · 团体动力学', en: 'Container-contained · Alpha function · O · No memory no desire · Group dynamics', pt: 'Continente-conteúdo · Função alfa · O · Sem memória sem desejo · Dinâmica de grupo' },
    idx_m_rogers_name: { zh: '罗杰斯', en: 'Rogers', pt: 'Rogers' },
    idx_m_rogers_desc: { zh: '人本主义 · 以人为中心 · 共情 · 无条件积极关注 · 自我实现', en: 'Humanistic · Person-centered · Empathy · Unconditional positive regard · Self-actualization', pt: 'Humanista · Centrado na pessoa · Empatia · Consideração positiva incondicional · Autorrealização' },
    idx_m_beck_name: { zh: '贝克', en: 'Beck', pt: 'Beck' },
    idx_m_beck_desc: { zh: '认知行为 · 自动思维 · 认知歪曲 · 合作经验主义 · 行为实验', en: 'Cognitive-behavioral · Automatic thoughts · Cognitive distortions · Collaborative empiricism · Behavioral experiments', pt: 'Cognitivo-comportamental · Pensamentos automáticos · Distorções cognitivas · Empirismo colaborativo · Experimentos comportamentais' },
    idx_m_yalom_name: { zh: '亚隆', en: 'Yalom', pt: 'Yalom' },
    idx_m_yalom_desc: { zh: '存在主义 · 四大终极关怀 · 此时此刻 · 人际动力 · 故事疗愈', en: 'Existential · Four ultimate concerns · Here and now · Interpersonal dynamics · Healing through stories', pt: 'Existencial · Quatro preocupações últimas · Aqui e agora · Dinâmica interpessoal · Cura pelas histórias' },
    idx_m_adler_name: { zh: '阿德勒', en: 'Adler', pt: 'Adler' },
    idx_m_adler_desc: { zh: '个体心理学 · 自卑与超越 · 勇气 · 社会兴趣 · 目的论', en: 'Individual psychology · Inferiority and superiority · Courage · Social interest · Teleology', pt: 'Psicologia individual · Inferioridade e superação · Coragem · Interesse social · Teleologia' },
    idx_m_sj_name: { zh: '苏珊·约翰逊', en: 'Susan Johnson', pt: 'Susan Johnson' },
    idx_m_sj_desc: { zh: 'EFT创始人 · 情感聚焦 · 依恋联结 · 爱的修复', en: 'Founder of EFT · Emotion-focused · Attachment bonds · Repairing love', pt: 'Fundadora da EFT · Focada nas emoções · Vínculos de apego · Reparação do amor' },

    idx_suggest_prompt: { zh: '你还想与哪位大师对话？写下名字发送给我们', en: 'Which master would you like to talk with next? Write a name and send it to us', pt: 'Com que mestre gostaria de conversar a seguir? Escreva um nome e envie-nos' },
    idx_suggest_ph: { zh: '输入大师姓名', en: 'Enter a master’s name', pt: 'Digite o nome de um mestre' },
    idx_suggest_btn: { zh: '留言', en: 'Send', pt: 'Enviar' },
    idx_suggest_alert: { zh: '感谢建议！邮件客户端已打开，发送即可。', en: 'Thanks for the suggestion! Your email client is open — just hit send.', pt: 'Obrigado pela sugestão! O seu cliente de e-mail foi aberto — basta enviar.' },
    idx_mp_line: { zh: '📢 关注公众号 <strong style="color:var(--accent);font-size:13px;">MindMeetsHeart</strong> · 每周精神分析深度内容', en: '📢 Follow <strong style="color:var(--accent);font-size:13px;">MindMeetsHeart</strong> · Weekly in-depth psychoanalysis', pt: '📢 Siga <strong style="color:var(--accent);font-size:13px;">MindMeetsHeart</strong> · Psicanálise aprofundada semanalmente' },
    idx_author: { zh: '📖 了解作者', en: '📖 About the author', pt: '📖 Sobre o autor' },
    idx_reward: { zh: '☕ 打赏', en: '☕ Tip', pt: '☕ Apoiar' },
    idx_sup_name: { zh: 'AI 临床督导', en: 'AI Clinical Supervision', pt: 'Supervisão Clínica com IA' },
    idx_sup_desc: { zh: '见真人督导前的免费梳理工具', en: 'A free tool to organize your thoughts before real supervision', pt: 'Ferramenta gratuita para organizar ideias antes da supervisão real' },
    idx_round_name: { zh: '多大师圆桌对话', en: 'Multi-Master Roundtable', pt: 'Mesa-Redonda de Mestres' },
    idx_round_desc: { zh: '多位大师同空间回应，支持 @ 指定', en: 'Several masters respond in one space, @-mention supported', pt: 'Vários mestres respondem no mesmo espaço, com suporte a @menção' },
    idx_custom_name: { zh: '定制服务', en: 'Custom Service', pt: 'Serviço Personalizado' },
    idx_custom_desc: { zh: '咨询师A · 需密码进入', en: 'Consultant A · password required', pt: 'Consultor A · requer senha' },
    idx_go: { zh: '前往 →', en: 'Go →', pt: 'Ir →' },
    idx_back_winnicott: { zh: '← 与温尼科特/拉康对话', en: '← Talk with Winnicott / Lacan', pt: '← Converse com Winnicott / Lacan' },
    idx_changelog_title: { zh: '更新日志', en: 'Changelog', pt: 'Registo de alterações' },
    idx_reward_title: { zh: '☕ 觉得是个好活？', en: '☕ Enjoying this?', pt: '☕ A gostar disto?' },
    idx_reward_body: { zh: '这网站免费用，但 API 调一次几毛钱<br>如果你聊得开心，可以打赏点 token 钱', en: 'This site is free, but each API call costs a little.<br>If you enjoyed it, feel free to tip some token money.', pt: 'Este site é gratuito, mas cada chamada de API custa um pouco.<br>Se gostou, sinta-se à vontade para apoiar com uns trocos.' },
    idx_reward_close: { zh: '收到，关掉', en: 'Got it, close', pt: 'Entendi, fechar' },

    /* ===== 对话页通用 ===== */
    chat_input_ph: { zh: '说点什么…', en: 'Say something…', pt: 'Diga algo…' },
    chat_send: { zh: '发送', en: 'Send', pt: 'Enviar' },
    chat_export: { zh: '导出对话', en: 'Export chat', pt: 'Exportar conversa' },
    chat_history: { zh: '历史对话', en: 'History', pt: 'Histórico' },
    chat_new: { zh: '新对话', en: 'New chat', pt: 'Nova conversa' },
    chat_clear: { zh: '清空', en: 'Clear', pt: 'Limpar' },
    chat_back_home: { zh: '← 返回首页', en: '← Home', pt: '← Início' },
    chat_settings: { zh: '设置', en: 'Settings', pt: 'Configurações' },
    chat_thinking: { zh: '思考中…', en: 'Thinking…', pt: 'A pensar…' },
    chat_kb_loading: { zh: '知识库加载中，请稍等', en: 'Knowledge base loading, please wait', pt: 'A carregar a base de conhecimento, aguarde' },
    chat_kb_fail: { zh: '加载知识库失败', en: 'Failed to load knowledge base', pt: 'Falha ao carregar a base de conhecimento' },
    chat_all_respond: { zh: '全体回应', en: 'All respond', pt: 'Todos respondem' },
    chat_mention_only: { zh: '仅被@回应', en: 'Mention only', pt: 'Só @responde' },
    chat_invite: { zh: '邀请大师加入', en: 'Invite a master', pt: 'Convidar um mestre' },
    chat_save: { zh: '保存对话', en: 'Save chat', pt: 'Guardar conversa' },
    chat_reward: { zh: '打赏', en: 'Tip', pt: 'Apoiar' },

    /* 三种对话模式（温度）*/
    mode_heart_title: { zh: '交心', en: 'Heart-to-heart', pt: 'De coração' },
    mode_consult_title: { zh: '咨询', en: 'Counseling', pt: 'Aconselhamento' },
    mode_teach_title: { zh: '教学', en: 'Teaching', pt: 'Ensino' },
    'lang-btn': { zh: 'EN', en: '中', pt: '中' },
    'dark-btn': { zh: '🌙 深色', en: '🌙 Dark', pt: '🌙 Dark' },
    'forward-btn': { zh: '✂️ 转发', en: '✂️ Select', pt: '✂️ Select' },
    'reward-btn': { zh: '☕ 打赏', en: '☕ Tip', pt: '☕ Tip' },
    'save-btn': { zh: '💾 保存', en: '💾 Save', pt: '💾 Save' },
    'export-btn': { zh: '📥 导出对话', en: '📥 Export', pt: '📥 Export' },
    'changelog-btn': { zh: '📋 更新日志', en: '📋 Changelog', pt: '📋 Changelog' },
    'reset-btn': { zh: '🔄 新对话', en: '🔄 New Chat', pt: '🔄 New Chat' },
    'history-btn': { zh: '📋 对话历史', en: '📋 History', pt: '📋 History' },
    'feedback-btn': { zh: '💡 反馈', en: '💡 Feedback', pt: '💡 Feedback' },
    'switch-master': { zh: '🎭 换大师', en: '🎭 Switch', pt: '🎭 Switch' },
    'supervisor-link': { zh: '🧑‍⚕️ AI督导', en: '🧑‍⚕️ Supervision', pt: '🧑‍⚕️ Supervision' },
    'forward-bar-count': { zh: '已选 0 条', en: 'Selected 0', pt: 'Selected 0' },
    'forward-cancel': { zh: '取消', en: 'Cancel', pt: 'Cancel' },
    'forward-gen': { zh: '生成分享图', en: 'Generate Card', pt: 'Generate Card' },
    'share-save': { zh: '长按图片保存，分享到朋友圈', en: 'Long press to save, share with friends', pt: 'Long press to save, share with friends' },
    'share-close': { zh: '关 闭', en: 'Close', pt: 'Close' },
    'reward-title': { zh: '☕ 觉得是个好活？', en: '☕ Enjoying the chat?', pt: '☕ Enjoying the chat?' },
    'reward-desc': { zh: '这网站免费用\n如果你聊得开心，可以打赏点 token 钱', en: 'Free to use\nIf you enjoy it, feel free to tip!', pt: 'Free to use\nIf you enjoy it, feel free to tip!' },
    'reward-close': { zh: '收到，关掉', en: 'Got it, close', pt: 'Got it, close' },
    'history-empty': { zh: '暂无历史对话', en: 'No history yet', pt: 'No history yet' },
    'h1-title': { zh: '与温尼科特对话', en: 'Chat with Winnicott', pt: 'Chat with Winnicott' },
    'h1-subtitle': { zh: '一个观察了六十年婴儿的儿科医生，用日常语言讨论人类经验', en: 'A pediatrician who watched babies for 40 years, speaking in plain language', pt: 'A pediatrician who watched babies for 40 years, speaking in plain language' },
    'settings-btn': { zh: '⚙️ 设置', en: '⚙️ Settings', pt: '⚙️ Settings' },
    'api-btn': { zh: '🔌 API', en: '🔌 API', pt: '🔌 API' },
    'api-btn-close': { zh: '🔌 收起', en: '🔌 Close', pt: '🔌 Close' },
    'default-mode': { zh: '默认（DeepSeek）', en: 'Default (DeepSeek)', pt: 'Default (DeepSeek)' },
    'custom-mode': { zh: '自用 API', en: 'Custom API', pt: 'Custom API' },
    'api-addr': { zh: '地址', en: 'Endpoint', pt: 'Endpoint' },
    'api-key-label': { zh: 'Key', en: 'Key', pt: 'Key' },
    'api-model': { zh: '模型', en: 'Model', pt: 'Model' },
    'temp-left': { zh: '❤️ 情感对话', en: '❤️ Emotional', pt: '❤️ Emotional' },
    'temp-right': { zh: '📚 知识回答', en: '📚 Knowledge', pt: '📚 Knowledge' },
    'temp-hint-left': { zh: '🧸 情感陪伴', en: 'Emotional', pt: 'Emotional' },
    'temp-hint-right': { zh: '📚 专业知识', en: 'Knowledge', pt: 'Knowledge' },
    'temp-hint-left-lacan': { zh: '◉ 直白解析', en: 'Plain', pt: 'Plain' },
    'temp-hint-right-lacan': { zh: '◈ 形式化推演', en: 'Formalized', pt: 'Formalized' },
    'save-history': { zh: '📥 保存到历史', en: '📥 Save History', pt: '📥 Save History' },
    'history-saved': { zh: '已保存到历史', en: 'Saved to history', pt: 'Saved to history' },
    'history-loaded': { zh: '已加载历史对话', en: 'History loaded', pt: 'History loaded' },
    'history-deleted': { zh: '已删除历史记录', en: 'History deleted', pt: 'History deleted' },
    'history-confirm-del': { zh: '确定删除此对话历史？', en: 'Delete this history?', pt: 'Delete this history?' },
    'history-msg-prefix': { zh: '条消息 · ', en: ' msgs · ', pt: ' msgs · ' },
    'persona-w': { zh: '🧸 温尼科特', en: 'Winnicott', pt: 'Winnicott' },
    'persona-l': { zh: '🎭 拉康', en: 'Lacan', pt: 'Lacan' },
    'persona-switched': { zh: '已切换到{persona}模式', en: 'Switched to {persona} mode', pt: 'Switched to {persona} mode' },
    'conv-cleared': { zh: '对话已清空', en: 'Conversation cleared', pt: 'Conversation cleared' },
    'modal-confirm': { zh: '确定', en: 'OK', pt: 'OK' },
    'modal-cancel': { zh: '取消', en: 'Cancel', pt: 'Cancel' },
    'modal-title': { zh: '确认', en: 'Confirm', pt: 'Confirm' },
    'modal-text': { zh: '确定执行此操作？', en: 'Are you sure?', pt: 'Are you sure?' },
    'input-placeholder': { zh: '写下你想说的……', en: 'Type your message...', pt: 'Type your message...' },
    'intro-title': { zh: '与温尼科特对话', en: 'Chat with Winnicott', pt: 'Chat with Winnicott' },
    'intro-sub': { zh: '选一个方向，我来调成最适合聊天的模式', en: 'Pick a direction and I will tune the mode for chatting', pt: 'Escolha uma direção e eu ajusto o modo para conversar' },
    'intro-desc': { zh: '基于温尼科特全集 12 卷、595 篇原著、81 个概念页、224 个案例报告的 AI 对话体验。选择以下方式开始——', en: 'An AI conversation based on the Collected Works (12 vols), 595 papers, 81 concepts, and 224 case reports. Choose a starting point:', pt: 'An AI conversation based on the Collected Works (12 vols), 595 papers, 81 concepts, and 224 case reports. Choose a starting point:' },
    'intro-greeting': { zh: '今天想聊聊什么？', en: 'What would you like to talk about today?', pt: 'What would you like to talk about today?' },
    'intro-hint-model': { zh: '🎭 先认识温尼科特', en: '🎭 Who is Winnicott?', pt: '🎭 Who is Winnicott?' },
    'intro-hint-anxiety': { zh: '😰 聊聊焦虑', en: '😰 Talk about anxiety', pt: '😰 Talk about anxiety' },
    'intro-hint-parent': { zh: '👶 育儿困惑', en: '👶 Parenting concerns', pt: '👶 Parenting concerns' },
    'intro-hint-relation': { zh: '💔 关系难题', en: '💔 Relationship issues', pt: '💔 Relationship issues' },
    'intro-hint-bored': { zh: '😶 随便聊聊', en: '😶 Just chat', pt: '😶 Just chat' },
    'chat-feeling-sub': { zh: '温度 10 · 温暖陪伴', en: 'Temp 10 · Warm company', pt: 'Temp 10 · Warm company' },
    'chat-professional': { zh: '聊聊专业', en: 'Talk theory', pt: 'Talk theory' },
    'chat-professional-sub': { zh: '温度 90 · 深度知识', en: 'Temp 90 · Deep knowledge', pt: 'Temp 90 · Deep knowledge' },
    'intro-english-tip': { zh: '💡 原始语料为英文，用英文提问效果更佳 / English prompts work best', en: '💡 Winnicott wrote in English — English prompts work best', pt: '💡 Winnicott wrote in English — English prompts work best' },
    disclaimer: { zh: '此对话由 AI 模拟人设思维框架生成，非临床治疗建议。如有心理困扰，请寻求专业帮助。', en: 'This conversation is an AI simulation and is not clinical advice. If you need help, seek a qualified professional.', pt: 'This conversation is an AI simulation and is not clinical advice. If you need help, seek a qualified professional.' },
    'ctx-label': { zh: '上下文字数', en: 'Context', pt: 'Context' },
    'banner-knowledge-loading': { zh: '知识库加载中，请稍等……', en: 'Loading knowledge base...', pt: 'Loading knowledge base...' },
    'banner-nokey': { zh: '未配置 API Key，请在设置中填写。', en: 'API Key not set. Please configure in Settings.', pt: 'API Key not set. Please configure in Settings.' },
    'banner-new-chat': { zh: '已开始新对话', en: 'New conversation started', pt: 'New conversation started' },
    'banner-retry': { zh: '线路繁忙，正在重试……', en: 'Route busy, retrying...', pt: 'Route busy, retrying...' },
    'banner-fallback': { zh: '本地代理离线，已切换云端模型', en: 'Local proxy offline, switched to cloud model', pt: 'Local proxy offline, switched to cloud model' },
    'banner-saved': { zh: '设置已保存（存于浏览器本地）', en: 'Settings saved (local storage)', pt: 'Settings saved (local storage)' },
    'chat-feeling': { zh: '聊聊心事', en: 'Share feelings', pt: 'Share feelings' },
    'email-btn': { zh: '📧 发送到邮箱', en: '📧 发送到邮箱', pt: '📧 发送到邮箱' },

  };

  /* ---------- 核心方法 ---------- */
  function getLang() {
    try { var v = localStorage.getItem(STORE_KEY); return LANGS.indexOf(v) >= 0 ? v : 'zh'; }
    catch (e) { return 'zh'; }
  }
  function t(key) {
    var e = DICT[key]; if (!e) return key;
    var l = getLang(); return e[l] || e.zh || key;
  }
  window.T = t;
  window.SITE_LANG = getLang();

  /* AI 系统提示词里的「回答语言」指令：各对话页读取此函数 */
  window.LANG_INSTRUCTION = function () {
    var l = getLang();
    if (l === 'en') return '①Always respond in English. Your language of reply must be English.';
    if (l === 'pt') return '①Always respond in Portuguese (Português). Your language of reply must be Portuguese.';
    return '①始终使用中文对话';
  };
  /* tempInstr 里「用中文」的多语言版本 */
  window.LANG_REPLY_LANG = function () {
    var l = getLang();
    if (l === 'en') return 'reply in English';
    if (l === 'pt') return 'reply in Portuguese (Português)';
    return '用中文';
  };

  function applyI18n() {
    var l = getLang();
    document.documentElement.setAttribute('lang', l === 'zh' ? 'zh-CN' : l);
    document.documentElement.setAttribute('data-lang', l);
    var i, els;
    els = document.querySelectorAll('[data-i18n]');
    for (i = 0; i < els.length; i++) {
      var k = els[i].getAttribute('data-i18n'); var e = DICT[k];
      if (e) els[i].textContent = e[l] || e.zh;
    }
    els = document.querySelectorAll('[data-i18n-html]');
    for (i = 0; i < els.length; i++) {
      var kh = els[i].getAttribute('data-i18n-html'); var eh = DICT[kh];
      if (eh) els[i].innerHTML = eh[l] || eh.zh;
    }
    els = document.querySelectorAll('[data-i18n-ph]');
    for (i = 0; i < els.length; i++) {
      var kp = els[i].getAttribute('data-i18n-ph'); var ep = DICT[kp];
      if (ep) els[i].setAttribute('placeholder', ep[l] || ep.zh);
    }
    try { if (typeof window.onLangApplied === 'function') window.onLangApplied(l); } catch (err) {}
  }
  window.applyI18n = applyI18n;

  function setLang(l, silent) {
    if (LANGS.indexOf(l) < 0) l = 'zh';
    try { localStorage.setItem(STORE_KEY, l); } catch (e) {}
    window.SITE_LANG = l;
    applyI18n();
    if (!silent) showConfirm(l);
  }
  window.setSiteLang = setLang;

  /* ---------- UI：语言按钮 + 选择层 + 确认框 ---------- */
  function injectStyles() {
    if (document.getElementById('i18n-style')) return;
    var css = '' +
      /* 浮动语言按钮默认放右下角 FAB，避免压住头部标题/返回控件 */
      '#langBtn{position:fixed;bottom:84px;right:14px;z-index:1000;display:inline-flex;align-items:center;gap:6px;' +
      'padding:7px 13px;border-radius:999px;border:1px solid rgba(139,111,92,.35);background:rgba(255,255,255,.92);' +
      'color:#8b6f5c;font-size:12.5px;font-weight:600;letter-spacing:.03em;cursor:pointer;font-family:inherit;' +
      'box-shadow:0 1px 4px rgba(45,41,37,.08);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);transition:all .2s ease;}' +
      '#langBtn:hover{border-color:#8b6f5c;box-shadow:0 3px 10px rgba(139,111,92,.18);transform:translateY(-1px);}' +
      '#langBtn .g{font-size:13px;line-height:1;}' +
      '.i18n-ovl{position:fixed;inset:0;z-index:1001;display:none;align-items:center;justify-content:center;' +
      'background:rgba(45,41,37,.28);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);}' +
      '.i18n-ovl.show{display:flex;}' +
      '.i18n-box{background:#fffdfb;border-radius:16px;padding:24px 22px;max-width:320px;width:88%;text-align:center;' +
      'box-shadow:0 8px 32px rgba(45,41,37,.16);font-family:"Noto Serif SC",Georgia,serif;' +
      'animation:i18nPop .26s cubic-bezier(.2,.8,.2,1) both;}' +
      '@keyframes i18nPop{from{opacity:0;transform:translateY(8px) scale(.97)}to{opacity:1;transform:none}}' +
      '.i18n-box h3{font-size:16px;font-weight:600;margin:0 0 16px;color:#2d2925;letter-spacing:.04em;}' +
      '.i18n-box .opt{display:flex;align-items:center;justify-content:space-between;width:100%;padding:13px 16px;margin-bottom:9px;' +
      'border:1px solid #e8e1d9;border-radius:12px;background:#fffdfb;cursor:pointer;font-family:inherit;font-size:14.5px;' +
      'color:#2d2925;transition:all .18s ease;}' +
      '.i18n-box .opt:hover{background:#f3ede6;border-color:#8b6f5c;}' +
      '.i18n-box .opt.cur{border-color:#8b6f5c;box-shadow:inset 0 0 0 1px #8b6f5c;}' +
      '.i18n-box .opt .tick{color:#8b6f5c;font-weight:700;opacity:0;}' +
      '.i18n-box .opt.cur .tick{opacity:1;}' +
      '.i18n-box p{font-size:13.5px;line-height:1.75;color:#5a534c;margin:0 0 18px;}' +
      '.i18n-box .prim{margin-top:2px;background:#8b6f5c;color:#fff;border:none;border-radius:10px;padding:11px 26px;' +
      'font-size:13.5px;cursor:pointer;font-family:inherit;letter-spacing:.04em;transition:all .18s ease;}' +
      '.i18n-box .prim:hover{background:#7a5f4d;transform:translateY(-1px);}' +
      '.i18n-box .lnk{margin-top:10px;background:none;border:none;font-size:12px;color:#8f857d;cursor:pointer;font-family:inherit;display:block;width:100%;}' +
      /* 保留旧版兼容：若代码仍引用 lang-corner，也保证在右下角 */
      '#langBtn.lang-corner{top:auto;bottom:84px;left:auto;right:14px;}';
    var s = document.createElement('style'); s.id = 'i18n-style'; s.textContent = css;
    document.head.appendChild(s);
  }

  function buildUI() {
    injectStyles();
    var existing = document.querySelector('.lang-btn:not(#langBtn)');
    if (existing) {
      /* 页面自带语言按钮（已在头部就位）→ 直接接管，不再注入浮动按钮，避免重复/重叠 */
      existing.setAttribute('data-i18n', 'lang-btn');
      existing.onclick = openSelect;
      if (!existing.id) existing.id = 'pageLangBtn';
      /* 兜底：旧缓存可能已注入 #langBtn，发现页内按钮时强制隐藏它 */
      var stale = document.getElementById('langBtn');
      if (stale) stale.style.display = 'none';
    } else if (!document.getElementById('langBtn')) {
      var btn = document.createElement('button');
      btn.id = 'langBtn';
      btn.setAttribute('aria-label', 'language');
      btn.innerHTML = '<span class="g">🌐</span><span>language</span>';
      btn.onclick = openSelect;
      document.body.appendChild(btn);
    }
    if (!document.getElementById('i18nSelectOvl')) {
      var ov = document.createElement('div');
      ov.className = 'i18n-ovl'; ov.id = 'i18nSelectOvl';
      ov.onclick = function (e) { if (e.target === ov) ov.classList.remove('show'); };
      var cur = getLang();
      var opts = LANGS.map(function (l) {
        return '<button class="opt' + (l === cur ? ' cur' : '') + '" data-l="' + l + '">' +
          '<span>' + LANG_LABEL[l] + '</span><span class="tick">✓</span></button>';
      }).join('');
      ov.innerHTML = '<div class="i18n-box"><h3 id="i18nSelTitle">' + t('lang_switch_title') + '</h3>' +
        opts + '</div>';
      document.body.appendChild(ov);
      ov.querySelectorAll('.opt').forEach(function (o) {
        o.onclick = function () { ov.classList.remove('show'); setLang(o.getAttribute('data-l')); };
      });
    }
    if (!document.getElementById('i18nConfirmOvl')) {
      var cv = document.createElement('div');
      cv.className = 'i18n-ovl'; cv.id = 'i18nConfirmOvl';
      cv.onclick = function (e) { if (e.target === cv) cv.classList.remove('show'); };
      cv.innerHTML = '<div class="i18n-box"><h3 id="i18nCfTitle"></h3><p id="i18nCfBody"></p>' +
        '<button class="prim" id="i18nCfOk"></button></div>';
      document.body.appendChild(cv);
      cv.querySelector('#i18nCfOk').onclick = function () { cv.classList.remove('show'); };
    }
  }

  function openSelect() {
    var ov = document.getElementById('i18nSelectOvl');
    var cur = getLang();
    ov.querySelector('#i18nSelTitle').textContent = t('lang_switch_title');
    ov.querySelectorAll('.opt').forEach(function (o) {
      if (o.getAttribute('data-l') === cur) o.classList.add('cur'); else o.classList.remove('cur');
    });
    ov.classList.add('show');
  }

  function showConfirm(l) {
    var cv = document.getElementById('i18nConfirmOvl');
    if (!cv) return;
    cv.querySelector('#i18nCfTitle').textContent = DICT.lang_confirm_title[l];
    cv.querySelector('#i18nCfBody').textContent =
      (l === 'en' ? DICT.lang_confirm_body_en : l === 'pt' ? DICT.lang_confirm_body_pt : DICT.lang_confirm_body_zh)[l];
    cv.querySelector('#i18nCfOk').textContent = DICT.lang_confirm_ok[l];
    cv.classList.add('show');
  }

  /* ---------- 启动 ---------- */
  function boot() { buildUI(); applyI18n(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
