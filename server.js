const cookieParser = require('cookie-parser');
const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const path = require('path');
const multer = require('multer');
const zlib = require('zlib');
const { promisify } = require('util');
const app = express();

// 将zlib的压缩和解压缩方法转换为Promise
const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

// 压缩内容
async function compressContent(content) {
    try {
        const buffer = Buffer.from(content, 'utf8');
        const compressed = await gzip(buffer);
        return compressed.toString('base64');
    } catch (error) {
        console.error('压缩内容失败:', error);
        throw error;
    }
}

// 解压缩内容
async function decompressContent(compressedContent) {
    try {
        if (!compressedContent) {
            console.log('内容为空，返回空字符串');
            return '';
        }

        // 检查内容是否已经是解压缩的
        if (typeof compressedContent === 'string' && !compressedContent.startsWith('H4sI')) {
            console.log('内容未压缩，直接返回');
            return compressedContent;
        }

        const buffer = Buffer.from(compressedContent, 'base64');
        const decompressed = await gunzip(buffer);
        const result = decompressed.toString('utf8');
        
        console.log('解压缩成功，内容长度:', result.length);
        return result;
    } catch (error) {
        console.error('解压缩内容失败:', error);
        console.error('压缩内容:', compressedContent);
        // 如果解压缩失败，尝试直接返回原始内容
        return compressedContent;
    }
}

// 中间件
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
// 会话配置建议
app.use(session({
  secret: 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { 
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000 // 1天
  }
}));


// 数据库连接池
const pool = mysql.createPool({
    host: 'localhost',
    user: 'root', // 替换为你的MySQL用户名
    password: '123456', // MySQL密码
    database: 'personal travel',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

//验证数据库是否连接
(async () => {
  try {
      const connection = await pool.getConnection();
      console.log('数据库连接成功');
      connection.release();
  } catch (error) {
      console.error('数据库操作错误:', error);
  }
})();

// 路由
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
// 添加favicon路由/*
/*app.get('/favicon.ico', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'favicon.ico'));
});*/
app.get('/register', (req, res) => {
  res.redirect('/public/register.html');
});
app.get('/PageOne', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'PageOne.html'));
  });
  app.get('/placeSearch', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'placeSearch.html'));
  });
  app.get('/routePlan', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'routePlan.html'));
  });
// 添加登录状态检查路由
app.get('/api/check-auth', (req, res) => {
  console.log('当前会话:', req.session); // 调试用
  if (req.session.user) {
      res.json({ 
          isLoggedIn: true,
          user: req.session.user 
      });
  } else {
      res.json({ isLoggedIn: false });
  }
});
// 搜索景点API
app.get('/api/spot/search', async (req, res) => {
    const query = req.query.q;
    
    if (!query || typeof query !== 'string') {
        return res.status(400).json({ 
            success: false,
            error: '搜索参数不能为空'
        });
    }
    
    try {
        const [results] = await pool.query(`
            SELECT * FROM spot 
            WHERE name LIKE ? 
               OR address LIKE ? 
               OR tag LIKE ?`,
            [`%${query}%`, `%${query}%`, `%${query}%`]
        );
        
        // 统一返回格式
        if (results.length === 0) {
            return res.status(200).json({
                success: true,
                data: [],
                message: `没有找到与"${query}"相关的地点`,
                suggestions: [
                    '尝试使用不同的关键词',
                    '检查输入是否有错别字',
                    '搜索更通用的名称'
                ]
            });
        }
        
        res.json({
            success: true,
            data: results
        });
        
    } catch (error) {
        console.error('搜索错误:', error);
        res.status(500).json({ 
            success: false,
            error: '搜索失败',
            details: error.message 
        });
    }
});
// 获取景点列表API（修改版）
app.get('/api/spot', async (req, res) => {
    const { filter, tag } = req.query;
    const tagList = tag ? tag.split(',') : [];

    try {
        // 1. 获取所有景点
        let query = 'SELECT * FROM spot';
        const params = [];
        
        // 2. 按标签筛选
        if (tagList.length > 0) {
            query += ' WHERE ';
            query += tagList.map(t => 'tag LIKE ?').join(' OR ');
            params.push(...tagList.map(t => `%${t}%`));
        }
        
        const [spots] = await pool.query(query, params);
        
        // 3. 排序
        let sortedSpots = [...spots];
        if (filter === 'fire') {
            sortedSpots.sort((a, b) => b.fire - a.fire);
        } else if (filter === 'score') {
            sortedSpots.sort((a, b) => b.score - a.score);
        }
        
        // 4. 不再限制返回数量
        res.json(sortedSpots);
    } catch (error) {
        console.error('数据库错误:', error);
        res.status(500).json({ 
            error: 'Failed to fetch spots',
            details: error.message 
        });
    }
});
// 更新景点浏览量API（确保返回最新值）
// 使用两条SQL语句的方式
app.post('/api/spot/:name/fire', async (req, res) => {
  try {
    const { name } = req.params;
    
    // 更新热度
    await pool.query(
      'UPDATE spot SET fire = fire + 1 WHERE name = ?',
      [name]
    );
    
    // 获取新的热度值
    const [result] = await pool.query(
      'SELECT fire as newFireCount FROM spot WHERE name = ?',
      [name]
    );
    
    res.json({
      success: true,
      newFireCount: result[0].newFireCount
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '更新热度失败' });
  }
});
// POST /api/temporal 端点
app.post('/api/temporal', async (req, res) => {
    try {
        const { attraction } = req.body; // 现在接收单个景点而不是数组

        if (!attraction) {
            return res.status(400).json({
                success: false,
                message: '景点名称不能为空'
            });
        }

        // 假设temporal表的结构包含一个name字段来存储单个景点名称
        const result = await pool.query(
            'INSERT INTO temporal (name) VALUES (?)',
            [attraction] // 直接插入景点名称，不需要JSON.stringify
        );

        res.status(201).json({
            success: true,
            message: '景点数据已成功保存到temporal表',
            data: {
                id: result.insertId,
                attraction: attraction // 返回单个景点
            }
        });
    } catch (error) {
        console.error('保存到数据库失败:', error);
        res.status(500).json({
            success: false,
            message: '保存到数据库失败',
            error: error.message
        });
    }
});
// 注册接口
app.post('/api/register', async (req, res) => {
    try {
      console.log('请求体:', req.body); // 确保请求体正确
        const { username, email,password } = req.body;
        // 验证邮箱格式
        if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
          return res.status(400).json({ 
              success: false, 
              message: '无效的邮箱格式' 
          });
      }
      // 检查邮箱是否已存在
      const [emailCheck] = await pool.execute(
          'SELECT * FROM users WHERE email = ?', 
          [email]
      );
      console.log('邮箱检查:', emailCheck); // 确保查询结果正确
      if (emailCheck.length > 0) {
          return res.status(400).json({ 
              success: false, 
              message: '该邮箱已被注册' 
          });
      }
      // 插入包含邮箱的用户数据
      const hashedPassword = await bcrypt.hash(password, 10);
      console.log('哈希后的密码:', hashedPassword); // 确保密码哈希成功
      const [result] = await pool.execute(
          'INSERT INTO users (username, email, password) VALUES (?, ?, ?)',
          [username, email, hashedPassword]
      );
      console.log('插入结果:', result); // 确保插入操作成功
        res.json({ success: true });
    } catch (error) {
      console.error('注册错误:', error); // 捕获并输出错误
        res.status(500).json({ success: false, message: '注册失败' });
    }
});

// 登录接口
app.post('/api/login', async (req, res) => {
  try {
      const { username, password } = req.body;
      
      // 1. 输入验证
      if (!username || !password) {
        console.log('为空（调试）');
          return res.status(400).json({ 
              success: false, 
              message: '用户名和密码不能为空' 
          });
      }

      // 2. 查询数据库
      const [rows] = await pool.execute(
       
          'SELECT id, username, password FROM users WHERE username = ?',
          [username]
      );
      
      // 3. 用户不存在
      if (rows.length === 0) {
        console.log('不存在');
          return res.status(401).json({ 
              success: false, 
              message: '用户名或密码错误' // 避免提示太具体
          });
      }
      
      const user = rows[0];
      
      // 4. 验证密码
      const passwordMatch = await bcrypt.compare(password, user.password);
      console.log('验证中');
      if (!passwordMatch) {
        
          return res.status(401).json({ 
              success: false, 
              message: '用户名或密码错误' 
          });
      }
      
      // 5. 创建会话
      req.session.user = {
          id: user.id,
          username: user.username
      };
      
      // 6. 返回成功响应（只返回相对路径）
      res.status(200).json({ 
          success: true,
          redirectUrl: '/PageOne' // 改为你的应用内部路径
      });
      
  } catch (error) {
      console.error('登录错误:', error);
      res.status(500).json({ 
          success: false, 
          message: '服务器错误，请稍后再试' 
      });
  }
});

// 修改发布日记接口，使用zlib压缩
app.post('/api/journals', async (req, res) => {
    try {
        const { title, content, destination, id, tag } = req.body;
        
        if (!req.session.user) {
            return res.status(401).json({ 
                success: false, 
                message: '请先登录' 
            });
        }
        
        // 压缩内容
        const compressedContent = await compressContent(content);
        
        // 插入日记数据
        const [result] = await pool.execute(
            'INSERT INTO Journals (id, title, content, destination, tag, created_at) VALUES (?, ?, ?, ?, ?, NOW())',
            [id, title, compressedContent, destination, tag]
        );
        
        res.json({ 
            success: true, 
            journalId: result.insertId,
            message: '日记发布成功' 
        });
    } catch (error) {
        console.error('发布日记错误:', error);
        res.status(500).json({ 
            success: false, 
            message: '发布日记失败' 
        });
    }
});

// 获取日记列表接口
app.get('/api/journals', async (req, res) => {
    try {
        const [journals] = await pool.execute(`
            SELECT j.*, u.username as author,
                   (SELECT COUNT(*) FROM Likes WHERE journal_id = j.journal_id) as likes_count,
                   (SELECT AVG(rating_value) FROM Ratings WHERE journal_id = j.journal_id) as avg_rating
            FROM Journals j
            JOIN Users u ON j.id = u.id
            ORDER BY j.created_at DESC
        `);
        
        // 获取每个日记的图片并解压缩内容
        for (let journal of journals) {
            // 解压缩内容
            try {
                journal.content = await decompressContent(journal.content);
            } catch (error) {
                console.error('解压缩内容失败:', error);
                journal.content = '内容加载失败';
            }
            
            // 获取图片
            const [images] = await pool.execute(
                'SELECT * FROM Images WHERE journal_id = ?',
                [journal.journal_id]
            );
            journal.images = images;
        }
        
        res.json({ success: true, journals });
    } catch (error) {
        console.error('获取日记列表错误:', error);
        res.status(500).json({ 
            success: false, 
            message: '获取日记列表失败' 
        });
    }
});

// 修改获取日记详情接口，使用zlib解压缩
app.get('/api/journals/:id', async (req, res) => {
    try {
        const journalId = req.params.id;
        
        // 更新浏览量
        await pool.execute(
            'UPDATE Journals SET views = COALESCE(views, 0) + 1 WHERE journal_id = ?',
            [journalId]
        );

        // 获取日记基本信息
        const [journals] = await pool.execute(`
            SELECT j.*, u.username as author,
                   (SELECT COUNT(*) FROM Likes WHERE journal_id = j.journal_id) as likes_count,
                   (SELECT AVG(rating_value) FROM Ratings WHERE journal_id = j.journal_id) as avg_rating
            FROM Journals j
            JOIN Users u ON j.id = u.id
            WHERE j.journal_id = ?
        `, [journalId]);
        
        if (journals.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: '日记不存在' 
            });
        }
        
        // 解压缩内容
        const journal = journals[0];
        try {
            journal.content = await decompressContent(journal.content);
        } catch (error) {
            console.error('解压缩内容失败:', error);
            // 如果解压缩失败，使用原始内容
        }
        
        // 获取日记的图片
        const [images] = await pool.execute(
            'SELECT * FROM Images WHERE journal_id = ?',
            [journalId]
        );
        
        // 获取日记的评论
        const [comments] = await pool.execute(`
            SELECT c.*, u.username as author,
                   (SELECT COUNT(*) FROM CommentLikes WHERE comment_id = c.comment_id) as likes_count
            FROM Comments c
            JOIN Users u ON c.id = u.id
            WHERE c.journal_id = ?
            ORDER BY c.created_at DESC
        `, [journalId]);
        
        // 获取每个评论的回复
        for (let comment of comments) {
            const [replies] = await pool.execute(`
                SELECT r.*, u.username as author
                FROM Replies r
                JOIN Users u ON r.id = u.id
                WHERE r.comment_id = ?
                ORDER BY r.created_at ASC
            `, [comment.comment_id]);
            comment.replies = replies;
        }
        
        const journalWithDetails = { 
            ...journal, 
            images, 
            comments 
        };
        
        res.json({ 
            success: true, 
            journal: journalWithDetails 
        });
    } catch (error) {
        console.error('获取日记详情错误:', error);
        res.status(500).json({ 
            success: false, 
            message: '获取日记详情失败',
            error: error.message 
        });
    }
});

// 配置multer存储
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'public/uploads/') // 确保这个目录存在
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname))
    }
});

const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 50 * 1024 * 1024 // 限制50MB，支持视频文件
    },
    fileFilter: function (req, file, cb) {
        // 允许图片和视频文件
        if (!file.originalname.match(/\.(jpg|jpeg|png|gif|mp4|mov|avi|wmv)$/)) {
            return cb(new Error('只允许上传图片和视频文件！'));
        }
        cb(null, true);
    }
});

// 上传图片接口
app.post('/api/journals/:id/images', upload.array('images', 5), async (req, res) => {
    try {
        const journalId = req.params.id;
        const files = req.files;
        
        if (!files || files.length === 0) {
            return res.status(400).json({ 
                success: false, 
                message: '没有上传文件' 
            });
        }
        
        // 保存文件信息到数据库
        for (let file of files) {
            const fileUrl = `/public/uploads/${file.filename}`;
            const fileType = file.mimetype.startsWith('video/') ? 'video' : 'image';
            
            await pool.execute(
                'INSERT INTO Images (journal_id, image_url, file_type) VALUES (?, ?, ?)',
                [journalId, fileUrl, fileType]
            );
        }
        
        res.json({ 
            success: true, 
            message: '文件上传成功',
            files: files.map(file => ({
                url: `/public/uploads/${file.filename}`,
                type: file.mimetype.startsWith('video/') ? 'video' : 'image'
            }))
        });
    } catch (error) {
        console.error('上传文件错误:', error);
        res.status(500).json({ 
            success: false, 
            message: '上传文件失败' 
        });
    }
});

// 发表评论接口
app.post('/api/journals/:journalId/comments', async (req, res) => {
    try {
        const journalId = req.params.journalId;
        const { content, id } = req.body;
        
        if (!req.session.user) {
            return res.status(401).json({ 
                success: false, 
                message: '请先登录' 
            });
        }
        
        const [result] = await pool.execute(
            'INSERT INTO Comments (journal_id, id, content, created_at) VALUES (?, ?, ?, NOW())',
            [journalId, id, content]
        );
        
        res.json({ 
            success: true, 
            message: '评论发表成功',
            commentId: result.insertId
        });
    } catch (error) {
        console.error('发表评论错误:', error);
        res.status(500).json({ 
            success: false, 
            message: '发表评论失败' 
        });
    }
});

// 点赞接口
app.post('/api/journals/:id/like', async (req, res) => {
    try {
        const journalId = req.params.id;
        const { id } = req.body;
        
        if (!req.session.user) {
            return res.status(401).json({ 
                success: false, 
                message: '请先登录' 
            });
        }
        
        // 检查是否已经点赞
        const [existing] = await pool.execute(
            'SELECT * FROM Likes WHERE journal_id = ? AND id = ?',
            [journalId, id]
        );
        
        if (existing.length > 0) {
            // 取消点赞
            await pool.execute(
                'DELETE FROM Likes WHERE journal_id = ? AND id = ?',
                [journalId, id]
            );
            res.json({ 
                success: true, 
                message: '取消点赞成功',
                liked: false
            });
        } else {
            // 添加点赞
            await pool.execute(
                'INSERT INTO Likes (journal_id, id) VALUES (?, ?)',
                [journalId, id]
            );
            res.json({ 
                success: true, 
                message: '点赞成功',
                liked: true
            });
        }
    } catch (error) {
        console.error('点赞操作错误:', error);
        res.status(500).json({ 
            success: false, 
            message: '操作失败' 
        });
    }
});

// 评分接口
app.post('/api/journals/:id/rate', async (req, res) => {
    try {
        const journalId = req.params.id;
        const { id, rating_value } = req.body;
        
        if (!req.session.user) {
            return res.status(401).json({ 
                success: false, 
                message: '请先登录' 
            });
        }
        
        // 检查是否已经评分
        const [existing] = await pool.execute(
            'SELECT * FROM Ratings WHERE journal_id = ? AND id = ?',
            [journalId, id]
        );
        
        if (existing.length > 0) {
            // 更新评分
            await pool.execute(
                'UPDATE Ratings SET rating_value = ? WHERE journal_id = ? AND id = ?',
                [rating_value, journalId, id]
            );
        } else {
            // 添加评分
            await pool.execute(
                'INSERT INTO Ratings (journal_id, id, rating_value) VALUES (?, ?, ?)',
                [journalId, id, rating_value]
            );
        }
        
        res.json({ 
            success: true, 
            message: '评分成功'
        });
    } catch (error) {
        console.error('评分错误:', error);
        res.status(500).json({ 
            success: false, 
            message: '评分失败' 
        });
    }
});

// 删除日记接口
app.delete('/api/journals/:id', async (req, res) => {
    try {
        const journalId = req.params.id;
        
        // 检查用户是否登录
        if (!req.session.user) {
            return res.status(401).json({ 
                success: false, 
                message: '请先登录' 
            });
        }
        
        // 检查日记是否存在且属于当前用户
        const [journals] = await pool.execute(
            'SELECT * FROM Journals WHERE journal_id = ? AND id = ?',
            [journalId, req.session.user.id]
        );
        
        if (journals.length === 0) {
            return res.status(403).json({ 
                success: false, 
                message: '您没有权限删除此日记' 
            });
        }
        
        // 删除相关的图片、评论、点赞和评分记录
        await pool.execute('DELETE FROM Images WHERE journal_id = ?', [journalId]);
        await pool.execute('DELETE FROM Comments WHERE journal_id = ?', [journalId]);
        await pool.execute('DELETE FROM Likes WHERE journal_id = ?', [journalId]);
        await pool.execute('DELETE FROM Ratings WHERE journal_id = ?', [journalId]);
        
        // 删除日记
        await pool.execute('DELETE FROM Journals WHERE journal_id = ?', [journalId]);
        
        res.json({ 
            success: true, 
            message: '日记删除成功' 
        });
    } catch (error) {
        console.error('删除日记错误:', error);
        res.status(500).json({ 
            success: false, 
            message: '删除日记失败' 
        });
    }
});

// 登出接口
app.post('/api/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ 
                success: false, 
                message: '登出失败' 
            });
        }
        res.json({ 
            success: true, 
            message: '登出成功' 
        });
    });
});

// 检查用户是否点赞
app.post('/api/journals/:journalId/check-like', async (req, res) => {
    try {
        const { journalId } = req.params;
        const { id } = req.body;
        
        const [like] = await pool.query(
            'SELECT * FROM Likes WHERE journal_id = ? AND id = ?',
            [journalId, id]
        );
        
        res.json({ success: true, liked: like.length > 0 });
    } catch (error) {
        console.error('检查点赞状态错误:', error);
        res.status(500).json({ success: false, message: '检查点赞状态失败' });
    }
});

// 检查用户评分
app.post('/api/journals/:journalId/check-rating', async (req, res) => {
    try {
        const { journalId } = req.params;
        const { id } = req.body;
        
        const [rating] = await pool.query(
            'SELECT rating_value FROM Ratings WHERE journal_id = ? AND id = ?',
            [journalId, id]
        );
        
        res.json({ success: true, rating: rating.length > 0 ? rating[0].rating_value : null });
    } catch (error) {
        console.error('检查评分状态错误:', error);
        res.status(500).json({ success: false, message: '检查评分状态失败' });
    }
});

// 评论点赞接口
app.post('/api/comments/:commentId/like', async (req, res) => {
    try {
        const commentId = req.params.commentId;
        const { id } = req.body;
        
        if (!req.session.user) {
            return res.status(401).json({ 
                success: false, 
                message: '请先登录' 
            });
        }
        
        // 检查是否已经点赞
        const [existing] = await pool.execute(
            'SELECT * FROM CommentLikes WHERE comment_id = ? AND id = ?',
            [commentId, id]
        );
        
        if (existing.length > 0) {
            // 取消点赞
            await pool.execute(
                'DELETE FROM CommentLikes WHERE comment_id = ? AND id = ?',
                [commentId, id]
            );
            res.json({ 
                success: true, 
                message: '取消点赞成功',
                liked: false
            });
        } else {
            // 添加点赞
            await pool.execute(
                'INSERT INTO CommentLikes (comment_id, id) VALUES (?, ?)',
                [commentId, id]
            );
            res.json({ 
                success: true, 
                message: '点赞成功',
                liked: true
            });
        }
    } catch (error) {
        console.error('评论点赞错误:', error);
        res.status(500).json({ 
            success: false, 
            message: '操作失败' 
        });
    }
});

// 发表回复接口
app.post('/api/comments/:commentId/replies', async (req, res) => {
    try {
        const commentId = req.params.commentId;
        const { content, id } = req.body;
        
        if (!req.session.user) {
            return res.status(401).json({ 
                success: false, 
                message: '请先登录' 
            });
        }
        
        const [result] = await pool.execute(
            'INSERT INTO Replies (comment_id, id, content, created_at) VALUES (?, ?, ?, NOW())',
            [commentId, id, content]
        );
        
        res.json({ 
            success: true, 
            message: '回复发表成功',
            replyId: result.insertId
        });
    } catch (error) {
        console.error('发表回复错误:', error);
        res.status(500).json({ 
            success: false, 
            message: '发表回复失败' 
        });
    }
});

// 获取用户收藏的日记
app.get('/api/journals/favorites/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        
        // 获取用户点赞过的日记
        const [favorites] = await pool.execute(`
            SELECT j.*, u.username as author,
                   (SELECT COUNT(*) FROM Likes WHERE journal_id = j.journal_id) as likes_count,
                   (SELECT AVG(rating_value) FROM Ratings WHERE journal_id = j.journal_id) as avg_rating
            FROM Journals j
            JOIN Users u ON j.id = u.id
            JOIN Likes l ON j.journal_id = l.journal_id
            WHERE l.id = ?
            ORDER BY l.created_at DESC
        `, [userId]);
        // 获取每个日记的图片
        for (let journal of favorites) {
            const [images] = await pool.execute(
                'SELECT * FROM Images WHERE journal_id = ?',
                [journal.journal_id]
            );
            journal.images = images;
        }
        
        res.json({ 
            success: true, 
            favorites 
        });
    } catch (error) {
        console.error('获取收藏日记错误:', error);
        res.status(500).json({ 
            success: false, 
            message: '获取收藏日记失败' 
        });
    }
});

// 更新用户兴趣统计
app.post('/api/update-interest', async (req, res) => {
    try {
        const { id, tag } = req.body;
        
        if (!req.session.user) {
            return res.status(401).json({ 
                success: false, 
                message: '请先登录' 
            });
        }

        console.log('更新兴趣统计:', { id, tag }); // 调试日志

        // 检查是否已存在该标签的记录
        const [existingTag] = await pool.execute(
            'SELECT * FROM interest WHERE id = ? AND tag = ?',
            [id, tag]
        );

        if (existingTag.length > 0) {
            // 如果标签已存在，增加计数
            await pool.execute(
                'UPDATE interest SET count = count + 1 WHERE id = ? AND tag = ?',
                [id, tag]
            );
            console.log('更新现有标签计数'); // 调试日志
        } else {
            // 如果标签不存在，创建新记录
            await pool.execute(
                'INSERT INTO interest (id, tag, count) VALUES (?, ?, 1)',
                [id, tag]
            );
            console.log('创建新标签记录'); // 调试日志
        }

        // 获取所有标签的计数
        const [allTags] = await pool.execute(
            'SELECT tag, count FROM interest WHERE id = ?',
            [id]
        );

        // 找出计数最大的标签
        let maxCount = 0;
        let maxTag = tag;

        allTags.forEach(tagData => {
            if (tagData.count > maxCount) {
                maxCount = tagData.count;
                maxTag = tagData.tag;
            }
        });

        console.log('当前标签统计:', allTags); // 调试日志
        console.log('最大计数标签:', maxTag, '计数:', maxCount); // 调试日志

        res.json({ 
            success: true, 
            message: '兴趣统计更新成功',
            currentTag: tag,
            maxTag: maxTag,
            count: maxCount
        });
    } catch (error) {
        console.error('更新兴趣统计错误:', error);
        res.status(500).json({ 
            success: false, 
            message: '更新兴趣统计失败' 
        });
    }
});

// 获取用户兴趣统计
app.get('/api/interest/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        
        // 获取所有标签的计数
        const [allTags] = await pool.execute(
            'SELECT tag, count FROM interest WHERE id = ?',
            [userId]
        );

        console.log('获取用户兴趣统计:', userId, allTags); // 调试日志

        // 找出计数最大的标签
        let maxCount = 0;
        let maxTag = null;

        allTags.forEach(tagData => {
            if (tagData.count > maxCount) {
                maxCount = tagData.count;
                maxTag = tagData.tag;
            }
        });

        res.json({ 
            success: true, 
            interests: maxTag ? { tag: maxTag, count: maxCount } : null,
            allTags: allTags
        });
    } catch (error) {
        console.error('获取兴趣统计错误:', error);
        res.status(500).json({ 
            success: false, 
            message: '获取兴趣统计失败' 
      });
  }
});

// API端点
app.get('/api/drivedistance', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        origin1, 
        origin2, 
        destination1, 
        destination2, 
        distance,
        congestion
      FROM drivedistance
    `);
    
    res.json(rows);
    
  } catch (err) {
    console.error('数据库错误:', err);
    res.status(500).json({ 
      error: 'Failed to fetch drive distance data',
      details: err.message,
      sql: err.sql
    });
  }
});

app.get('/api/ridedistance', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        origin1, 
        origin2, 
        destination1, 
        destination2, 
        distance,
        congestion
      FROM ridedistance
    `);
    
    res.json(rows);
    
  } catch (err) {
    console.error('数据库错误:', err);
    res.status(500).json({ 
      error: 'Failed to fetch ride distance data',
      details: err.message,
      sql: err.sql
    });
  }
});

app.get('/api/walkdistance', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        origin1, 
        origin2, 
        destination1, 
        destination2, 
        distance,
        congestion
      FROM walkdistance
    `);
    
    res.json(rows);
    
  } catch (err) {
    console.error('数据库错误:', err);
    res.status(500).json({ 
      error: 'Failed to fetch walk distance data',
      details: err.message,
      sql: err.sql
    });
  }
});

app.get('/api/bupt_spot_message', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        name, 
        lng, 
        lat, 
        type
      FROM bupt_spot_message
    `);
    
    res.json(rows);
    
  } catch (err) {
    console.error('数据库错误:', err);
    res.status(500).json({ 
      error: 'Failed to fetch bupt_spot_message',
      details: err.message,
      sql: err.sql
    });
  }
});

// API端点
app.get('/api/beihai_drivedistance', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        origin1, 
        origin2, 
        destination1, 
        destination2, 
        distance,
        congestion
      FROM beihai_drivedistance
    `);
    
    res.json(rows);
    
  } catch (err) {
    console.error('数据库错误:', err);
    res.status(500).json({ 
      error: 'Failed to fetch drive distance data',
      details: err.message,
      sql: err.sql
    });
  }
});

app.get('/api/beihai_ridedistance', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        origin1, 
        origin2, 
        destination1, 
        destination2, 
        distance,
        congestion
      FROM beihai_ridedistance
    `);
    
    res.json(rows);
    
  } catch (err) {
    console.error('数据库错误:', err);
    res.status(500).json({ 
      error: 'Failed to fetch ride distance data',
      details: err.message,
      sql: err.sql
    });
  }
});

app.get('/api/beihai_walkdistance', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        origin1, 
        origin2, 
        destination1, 
        destination2, 
        distance,
        congestion
      FROM beihai_walkdistance
    `);
    
    res.json(rows);
    
  } catch (err) {
    console.error('数据库错误:', err);
    res.status(500).json({ 
      error: 'Failed to fetch walk distance data',
      details: err.message,
      sql: err.sql
    });
  }
});

app.get('/api/beihai_spot_message', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        name, 
        lng, 
        lat, 
        type
      FROM beihai_spot_message
    `);
    
    res.json(rows);
    
  } catch (err) {
    console.error('数据库错误:', err);
    res.status(500).json({ 
      error: 'Failed to fetch bupt_spot_message',
      details: err.message,
      sql: err.sql
    });
  }
});

app.get('/api/temporal', async (req, res) => {
  try {
    // 使用正确的表名（假设是 temporal）
    const [countRows] = await pool.query('SELECT COUNT(*) AS total FROM temporal');
    const totalRows = countRows[0].total;

    if (totalRows === 0) {
      return res.status(404).json({ error: "No data found" });
    }

    const offset = totalRows - 1;
    const [dataRows] = await pool.query(
      'SELECT name FROM temporal LIMIT 1 OFFSET ?', 
      [offset]
    );

    res.json(dataRows);
  } catch (err) {
    console.error('数据库错误:', err);
    res.status(500).json({ error: err.message });
  }
});

// 添加测试路由
app.get('/api/test-compression', async (req, res) => {
    try {
        // 测试用例1：重复内容较多的文本
        const testContent1 = "今天天气真好，阳光明媚。今天天气真好，阳光明媚。今天天气真好，阳光明媚。";
        
        // 测试用例2：普通日记内容
        const testContent2 = "今天去了北海公园，看到了美丽的白塔。公园里有很多游客，大家都在拍照。湖水清澈，倒映着蓝天白云。";
        
        // 测试用例3：长文本
        const testContent3 = "这是一篇很长的旅游日记，记录了我去北海公园的所见所闻。公园里有很多历史建筑，每一座建筑都诉说着不同的故事。游客们在这里拍照留念，孩子们在草地上玩耍。湖水清澈见底，倒映着蓝天白云，美不胜收。这是一篇很长的旅游日记，记录了我去北海公园的所见所闻。公园里有很多历史建筑，每一座建筑都诉说着不同的故事。";
        
        const results = [];
        
        // 测试压缩和解压缩
        for (let i = 0; i < 3; i++) {
            const content = eval(`testContent${i + 1}`);
            const compressed = await compressContent(content);
            const decompressed = await decompressContent(compressed);
            
            results.push({
                originalLength: content.length,
                compressedLength: compressed.length,
                compressionRatio: (content.length / compressed.length).toFixed(2),
                isCorrect: content === decompressed
            });
        }
        
        res.json({
            success: true,
            results: results
        });
    } catch (error) {
        console.error('压缩测试错误:', error);
        res.status(500).json({
            success: false,
            message: '测试失败',
            error: error.message
        });
    }
});

// 启动服务器
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`服务器运行在 http://localhost:${PORT}`);
});