// 显示消息的辅助函数
function showMessage(element, text, type) {
  const messageEl = typeof element === 'string' 
      ? document.getElementById(element) 
      : element;
  messageEl.textContent = text;
  messageEl.className = `message ${type}`;
  messageEl.style.display = 'block';
  
  // 3秒后自动消失（仅错误消息）
  if (type === 'error') {
      setTimeout(() => {
          messageEl.style.display = 'none';
      }, 3000);
  }
}

// 邮箱验证函数
function validateEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

// 登录表单处理
if (document.getElementById('loginForm')) {
  document.getElementById('loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const form = e.target;
      const username = form.username.value.trim();
      const password = form.password.value.trim();
      const messageEl = document.getElementById('message');
      const submitBtn = form.querySelector('button[type="submit"]');
      
      try {
          // 显示加载状态
          submitBtn.disabled = true;
          submitBtn.textContent = '登录中...';
          
          const response = await fetch('/api/login', {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json'
              },
              body: JSON.stringify({ username, password }),
              credentials: 'include'
          });
          
          const data = await response.json();
          
          if (!response.ok) {
              throw new Error(data.message || '登录失败');
          }
          
          if (data.success) {
              showMessage(messageEl, '登录成功！即将跳转...', 'success');
              console.log('即将跳转到:', data.redirectUrl);
              setTimeout(() => {
                const defaultUrl = '/public/PageOne'; // 跳转地址
                const redirectUrl = data.redirectUrl || defaultUrl;
                
                console.log(`跳转到: ${redirectUrl}`); // 调试用
                window.location.href = redirectUrl;
            }, 1500);
          } else {
              showMessage(messageEl, data.message || '用户名或密码错误', 'error');
          }
      } catch (error) {
          console.error('登录错误:', error);
          showMessage(messageEl, error.message || '登录过程中发生错误', 'error');
      } finally {
          // 恢复按钮状态
          submitBtn.disabled = false;
          submitBtn.textContent = '登录';
      }
  });
}

// 注册表单处理
if (document.getElementById('registerForm')) {
  document.getElementById('registerForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const form = e.target;
      const username = form.username.value.trim();
      const email = form.email.value.trim(); // 获取邮箱值
      const password = form.password.value.trim();
      const messageEl = document.getElementById('message');
      const submitBtn = form.querySelector('button[type="submit"]');
      
      // 输入验证
      if (!username || !email || !password) {
          showMessage(messageEl, '请填写所有字段', 'error');
          return;
      }
      
      // 邮箱格式验证
      if (!validateEmail(email)) {
          showMessage(messageEl, '请输入有效的电子邮箱', 'error');
          return;
      }
      
      // 密码长度验证
      if (password.length < 6) {
          showMessage(messageEl, '密码长度至少为6位', 'error');
          return;
      }
      
      try {
          // 显示加载状态
          submitBtn.disabled = true;
          submitBtn.textContent = '注册中...';
          
          const response = await fetch('/api/register', {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json'
              },
              body: JSON.stringify({ username, email, password }) // 包含邮箱
          });
          
          const data = await response.json();
          
          if (!response.ok) {
              throw new Error(data.message || '注册失败');
          }
          
          if (data.success) {
              showMessage(messageEl, '注册成功！即将跳转到登录页面...', 'success');
              setTimeout(() => {
                  window.location.href = '/';
              }, 1500);
          } else {
              showMessage(messageEl, data.message || '注册失败', 'error');
          }
      } catch (error) {
          console.error('注册错误:', error);
          showMessage(messageEl, error.message || '注册过程中发生错误', 'error');
      } finally {
          // 恢复按钮状态
          submitBtn.disabled = false;
          submitBtn.textContent = '注册';
      }
  });
}

