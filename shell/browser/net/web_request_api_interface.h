// Copyright (c) 2020 GitHub, Inc.
// Use of this source code is governed by the MIT license that can be
// found in the LICENSE file.

#ifndef ELECTRON_SHELL_BROWSER_NET_WEB_REQUEST_API_INTERFACE_H_
#define ELECTRON_SHELL_BROWSER_NET_WEB_REQUEST_API_INTERFACE_H_

#include <chrono>
#include <fstream>
#include <iomanip>
#include <set>
#include <sstream>
#include <string>

#include "net/base/completion_once_callback.h"
#include "services/network/public/cpp/resource_request.h"

namespace extensions {
struct WebRequestInfo;
}  // namespace extensions

namespace electron {

// Defines the interface for WebRequest API, implemented by api::WebRequestNS.
class WebRequestAPI {
 public:
  virtual ~WebRequestAPI() = default;

  using BeforeSendHeadersCallback =
      base::OnceCallback<void(const std::set<std::string>& removed_headers,
                              const std::set<std::string>& set_headers,
                              int error_code)>;

  virtual bool HasListener() const = 0;
  virtual int OnBeforeRequest(extensions::WebRequestInfo* info,
                              const network::ResourceRequest& request,
                              net::CompletionOnceCallback callback,
                              GURL* new_url) = 0;
  virtual int OnBeforeSendHeaders(extensions::WebRequestInfo* info,
                                  const network::ResourceRequest& request,
                                  BeforeSendHeadersCallback callback,
                                  net::HttpRequestHeaders* headers) = 0;
  virtual int OnHeadersReceived(
      extensions::WebRequestInfo* info,
      const network::ResourceRequest& request,
      net::CompletionOnceCallback callback,
      const net::HttpResponseHeaders* original_response_headers,
      scoped_refptr<net::HttpResponseHeaders>* override_response_headers,
      GURL* allowed_unsafe_redirect_url) = 0;
  virtual void OnSendHeaders(extensions::WebRequestInfo* info,
                             const network::ResourceRequest& request,
                             const net::HttpRequestHeaders& headers) = 0;
  virtual void OnBeforeRedirect(extensions::WebRequestInfo* info,
                                const network::ResourceRequest& request,
                                const GURL& new_location) = 0;
  virtual void OnResponseStarted(extensions::WebRequestInfo* info,
                                 const network::ResourceRequest& request) = 0;
  virtual void OnErrorOccurred(extensions::WebRequestInfo* info,
                               const network::ResourceRequest& request,
                               int net_error) = 0;
  virtual void OnCompleted(extensions::WebRequestInfo* info,
                           const network::ResourceRequest& request,
                           int net_error) = 0;
  virtual void OnRequestWillBeDestroyed(extensions::WebRequestInfo* info) = 0;

  // Called when the response body is available for inspection and modification
  // Not part of the default WebRequestAPI, this is added by Electron
  virtual int OnResponseReceived(extensions::WebRequestInfo* info,
                                 const network::ResourceRequest& request,
                                 net::CompletionOnceCallback callback,
                                 std::string* response_body);
};

// Default implementation for OnResponseReceived
inline int WebRequestAPI::OnResponseReceived(
    extensions::WebRequestInfo* info,
    const network::ResourceRequest& request,
    net::CompletionOnceCallback callback,
    std::string* response_body) {
  // 获取当前时间戳
  auto now = std::chrono::system_clock::now();
  auto now_time_t = std::chrono::system_clock::to_time_t(now);
  auto now_ms = std::chrono::duration_cast<std::chrono::milliseconds>(
                    now.time_since_epoch()) %
                1000;

  std::stringstream ss;
  ss << std::put_time(std::localtime(&now_time_t), "%Y-%m-%d %H:%M:%S");
  ss << '.' << std::setfill('0') << std::setw(3) << now_ms.count();

  // 打开日志文件
  std::ofstream log_file("D:/electron.log", std::ios::app);
  if (log_file.is_open()) {
    // 记录基本信息
    log_file << "\n[" << ss.str() << "] OnResponseReceived Event:\n";
    log_file << "Request ID: " << info->id << "\n";
    log_file << "URL: " << info->url << "\n";
    log_file << "Method: " << info->method << "\n";
    log_file << "Resource Type: " << info->web_request_type << "\n";

    // 记录请求头信息
    log_file << "Request Headers:\n";
    for (const auto& header : request.headers.GetHeaderVector()) {
      log_file << "  " << header.key << ": " << header.value << "\n";
    }

    // 记录响应体信息
    if (response_body) {
      log_file << "Response Body Length: " << response_body->length()
               << " bytes\n";
      // 如果响应体不是太大，也记录内容
      if (response_body->length() < 1024) {
        log_file << "Response Body Content: " << *response_body << "\n";
      }
    }

    // 记录其他相关信息
    log_file << "WebContents ID: " << info->web_contents_id << "\n";
    log_file << "Frame ID: " << info->frame_id << "\n";
    log_file << "Process ID: " << info->process_id << "\n";
    log_file << "Render Process ID: " << info->render_process_id << "\n";
    log_file << "Render Frame ID: " << info->render_frame_id << "\n";

    log_file << "----------------------------------------\n";
    log_file.close();
  }

  // 继续执行原有的逻辑
  return net::OK;
}

}  // namespace electron

#endif  // ELECTRON_SHELL_BROWSER_NET_WEB_REQUEST_API_INTERFACE_H_
