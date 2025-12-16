# Personalized Travel Guide - 个性化旅游指南系统
A full-stack web application for travel planning, scenic spot recommendation, travel journal management, and route optimization, designed to provide personalized travel experiences for users.

## 项目简介
本项目是一款集**用户认证、景点推荐、路线规划、场所查询、旅行日记管理**于一体的全栈个性化旅游指南系统。基于 Node.js + Express 后端架构与原生前端技术开发，支持按用户兴趣精准推荐景点、多策略路线规划（最短距离/最短时间）、图文视频日记记录与互动，满足旅游爱好者从出行规划到旅程分享的全流程需求。

## 核心功能
### 1. 用户认证模块
- 支持用户注册（含邮箱格式校验、重复注册拦截）、登录、登出功能
- 基于 Session + Cookie 实现登录态管理，密码加密存储（bcryptjs）
- 个人兴趣标签统计，为个性化推荐提供数据支撑

### 2. 景点推荐与搜索模块
- 多维度筛选：支持按景点名称、类别、关键字搜索，标签筛选（历史景点、公园、自然景区等）
- 智能排序：可按热度（浏览量）、评分排序展示景点
- 个性化推荐：结合用户兴趣标签推送匹配景点

### 3. 路线规划模块
- 多场景路径规划：支持单点到单点、多点途经（TSP 算法）的路线规划
- 多策略选择：最短距离策略、最短时间策略（考虑道路拥挤度）
- 多交通方式：校区支持步行/自行车，景区支持步行/电瓶车，可混合选择
- 可视化展示：地图节点标记、路线详情分步展示（距离、时间）

### 4. 场所查询模块
- 周边设施查询：选中景点/场所后，可查询附近超市、洗手间、餐厅等服务设施
- 距离排序：查询结果按到起点的最短距离排序，支持按设施类型过滤

### 5. 旅行日记模块
- 全格式记录：支持文字、图片、视频（50MB 以内）上传记录旅行
- 互动功能：日记点赞、评分（1-5分）、评论及回复，评论点赞
- 日记管理：支持日记发布、删除、收藏，按热度/评分/发布时间排序检索
- 数据优化：日记内容压缩存储（zlib），提升存储效率与加载速度

## 技术栈
### 前端
- 页面构建：HTML5、CSS3
- 交互逻辑：原生 JavaScript
- 样式设计：styles.css、journal.css（统一UI风格）
- 可视化：结合地图API实现路线与景点展示

### 后端
- 开发框架：Node.js + Express
- 数据库：MySQL（连接池管理，支持200+景点/校园数据存储）
- 核心依赖：
  - 数据处理：multer（文件上传）、zlib（数据压缩）
  - 安全认证：bcryptjs（密码加密）、express-session（会话管理）
  - 数据库操作：mysql2/promise（异步数据库操作）

### 算法支撑
- 最短路径：Dijkstra 算法
- 多点路径：TSP 旅行商问题求解
- 排序算法：基于热度、评分的自定义排序
- 搜索算法：多字段模糊匹配查询

## 项目结构
```
personalized-travel-guide/
├── bin/                  # 可执行脚本目录
├── node_modules/         # Node.js 依赖模块
├── public/               # 静态资源目录
│   ├── uploads/          # 上传文件存储（图片/视频）
│   ├── index.html        # 登录页面
│   ├── PageOne.html      # 主页面（功能入口）
│   ├── placeSearch.html  # 场所查询页面
│   ├── routePlan.html    # 路线规划页面
│   ├── register.html     # 注册页面
│   ├── travel-journal.html # 旅行日记页面
│   ├── css/              # 样式文件（styles.css、journal.css等）
│   └── js/               # 前端脚本（script.js）
├── server.js             # 后端核心文件（API、数据库交互、业务逻辑）
├── package.json          # 项目依赖配置
├── package-lock.json     # 依赖锁文件
├── personal travel.sql   # 数据库初始化脚本
└── README.md             # 项目说明文档
```

## 快速启动
### 前置条件
- 安装 Node.js（v14+）、MySQL（5.7+）
- 配置 MySQL 数据库：创建 `personal travel` 数据库，执行 `personal travel.sql` 初始化表结构与测试数据

### 启动步骤
1. 克隆仓库到本地
   ```bash
   git clone <仓库地址>
   cd personalized-travel-guide
   ```
2. 安装依赖
   ```bash
   npm install
   ```
3. 配置数据库连接（修改 server.js 中 MySQL 配置）
   ```javascript
   const pool = mysql.createPool({
     host: 'localhost',
     user: '你的MySQL用户名',
     password: '你的MySQL密码',
     database: 'personal travel',
     connectionLimit: 10
   });
   ```
4. 启动服务器
   ```bash
   node server.js
   ```
5. 访问系统：浏览器打开 `http://localhost:3000`，进入登录页面（默认端口 3000）

## 使用说明
1. 注册/登录：进入登录页面，新用户点击"立即注册"完成账号创建，已有账号直接登录
2. 景点探索：登录后进入主页面，通过"推荐"模块浏览景点，或使用搜索框精准查询
3. 路线规划：进入"规划与查找"页面，输入起点、终点（支持多点添加），选择交通方式与策略，点击"规划路线"查看结果
4. 日记管理：点击"写日志"发布旅行记录，可上传图片/视频；在"旅游日记"页面浏览他人分享，进行点赞、评论互动
5. 场所查询：在景点详情页，输入当前位置与设施类型，查询周边服务设施

## 数据说明
- 支持 200+ 景区/校园数据，每个场景包含≥20个建筑物、≥50个服务设施
- 道路网络：≥200条道路边，包含拥挤度、距离等属性，模拟真实出行场景
- 用户数据：支持≥10个用户并发使用，存储用户信息、兴趣标签、日记互动数据等

## 项目亮点
- 全栈闭环：从前端交互到后端逻辑、数据存储完全自主开发，功能完整
- 性能优化：采用数据压缩、数据库连接池、缓存等机制，提升系统响应速度
- 个性化体验：基于用户行为与兴趣标签实现精准推荐，适配不同旅游偏好
- 实用性强：覆盖旅行前规划、旅行中导航、旅行后分享全流程需求
