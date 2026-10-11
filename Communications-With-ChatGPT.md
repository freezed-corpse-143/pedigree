可以，把它建模成一个**由 DAG、画布尺寸和节点尺寸共同决定的约束优化问题**。画布尺寸是布局的输入；如果还要保留上一次的位置，则进一步成为有历史状态的布局。

下面给出一个可直接用于实现的模型。假设谱系从下往上生长，节点使用矩形挂件。

**1. 输入与优化变量**

给定：

\[ G=(V,E),\qquad \text{画布 }[0,W]\times[0,H] \]

每个节点 \(i\) 的尺寸为 \(w_i,h_i\)，优化其中心坐标：

\[ p_i=(x_i,y_i) \]

为便于比较不同画布，定义归一化坐标：

\[ q_i=\left(\frac{x_i}{W},\frac{y_i}{H}\right) \]

注意：**均匀性可以在归一化坐标下计算，但碰撞和文字间距应当在实际像素下计算。**

**2. 不可违反的硬约束**

节点必须在画布内，设边缘留白为 \(m\)：

\[ m+\frac{w_i}{2}\le x_i\le W-m-\frac{w_i}{2} \]\[ m+\frac{h_i}{2}\le y_i\le H-m-\frac{h_i}{2} \]

对于每条从祖先指向后代的边 \((i,j)\in E\)，要求后代位于上方。这里采用屏幕坐标，\(y\) 向下增大：

\[ y_i-y_j\ge \frac{h_i+h_j}{2}+g_y \]

其中 \(g_y\) 是最小纵向间距。

任意两个节点不得重叠，最小间距为 \(g_x,g_y\)：

\[ \boxed{ |x_i-x_j|\ge \frac{w_i+w_j}{2}+g_x \quad\lor\quad |y_i-y_j|\ge \frac{h_i+h_j}{2}+g_y } \]

这个“或”使问题成为非凸约束优化。实现时可以固定部分左右顺序，或者采用离散变量表达。

**3. 总目标：关系合理、密度均匀、空间充分利用**

\[ \boxed{ P^\star= \underset{P\in\mathcal F(G,W,H)}{\arg\min} \left[ \lambda_e R_{\mathrm{edge}} +\lambda_u R_{\mathrm{uniform}} +\lambda_f R_{\mathrm{fill}} +\lambda_c R_{\mathrm{cross}} +\lambda_s R_{\mathrm{stability}} \right] } \]

其中 \(\mathcal F\) 是满足前述硬约束的布局集合。各项如下。

**① 关系正则项：保持分支紧凑、有方向**

给每条边设置理想纵向跨度 \(\ell_{ij}>0\)，以画布高度的比例表示：

\[ R_{\mathrm{edge}} = \frac1{|E|} \sum_{(i,j)\in E} \left[ \alpha \left(\frac{x_i-x_j}{W}\right)^2 + \beta \left(\frac{y_i-y_j}{H}-\ell_{ij}\right)^2 \right] \]

第一部分减少不必要的横向拉伸；第二部分避免所有节点挤在底部或顶部。

如果边跨越多代，应给它更大的 \(\ell_{ij}\)。这个目标只要求尽量接近理想跨度，不强制每条边长度相同。

**② 均匀性正则项：让占据空间的密度接近目标密度**

这里不建议仅仅最大化两两距离，因为容易把节点推到画布边缘。更合适的是比较**空间密度**。

在归一化画布 \(\Omega=[0,1]^2\) 上，为节点定义平滑核 \(K_i\)，其宽度应随节点尺寸变化，并在 \(\Omega\) 内归一化。设面积权重为：

\[ a_i=\frac{w_i h_i}{\sum_j w_j h_j} \]

布局密度为：

\[ \rho_P(z)=\sum_i a_i K_i(z-q_i) \]

给定目标密度 \(\rho_\star(z)\)，满足：

\[ \int_\Omega\rho_\star(z)\,dz=1 \]

则：

\[ \boxed{ R_{\mathrm{uniform}} = \int_\Omega \left[\rho_P(z)-\rho_\star(z)\right]^2\,dz } \]

- 要铺满矩形画布，可以设 \(\rho_\star(z)=1\)。
- 要做参考图中的自然树形，可以让 \(\rho_\star\) 在树冠区域较高、主干附近较低。
- 实现时，将画布分成网格，对积分进行离散求和即可。

**这让“均匀”具有明确含义：人物占据空间的密度接近你指定的分布。**

**③ 空间利用正则项：避免整体缩成一团**

定义包含节点尺寸的布局边界：

\[ B_x=\max_i(x_i+w_i/2)-\min_i(x_i-w_i/2) \]\[ B_y=\max_i(y_i+h_i/2)-\min_i(y_i-h_i/2) \]

指定期望利用率 \(\eta_x,\eta_y\in(0,1]\)：

\[ R_{\mathrm{fill}} = \left(\frac{B_x}{W-2m}-\eta_x\right)^2 + \left(\frac{B_y}{H-2m}-\eta_y\right)^2 \]

例如 \(\eta_x=\eta_y=0.85\)，表示期望布局使用可用宽、高的约 \(85\%\)。它控制整体展开程度，密度项控制展开后的局部拥挤。

**④ 交叉正则项：减少谱系关系混乱**

设 \(\gamma_e\) 为边的绘制路径：

\[ R_{\mathrm{cross}} = \frac{1}{|\mathcal A|} \sum_{\{e,f\}\in\mathcal A} \mathbf 1 \left[ \gamma_e,\gamma_f \text{ 存在内部交叉} \right] \]

其中 \(\mathcal A\) 为不共享端点的边对；为空时此项取零。

这个目标不连续，通常通过层内排序、局部交换等离散步骤优化，再计算连续坐标。

**⑤ 历史位置正则项：增加节点时避免整棵树跳动**

如果存在旧布局，令旧节点的归一化位置为 \(q_i^{\mathrm{old}}\)：

\[ R_{\mathrm{stability}} = \frac1{|V_{\mathrm{old}}|} \sum_{i\in V_{\mathrm{old}}} \left\|q_i-q_i^{\mathrm{old}}\right\|^2 \]

首次布局时令 \(\lambda_s=0\)。画布改变尺寸时，使用归一化旧位置，可以优先保持相对位置。

------

这个模型明确分工：

| 要求               | 数学表达                   |
| ------------------ | -------------------------- |
| 不超出画布         | 边界硬约束                 |
| 不拥挤、不重叠     | 节点分离硬约束             |
| 祖先与后代方向正确 | DAG 方向硬约束             |
| 局部密度均匀       | \(R_{\mathrm{uniform}}\)   |
| 充分利用画布       | \(R_{\mathrm{fill}}\)      |
| 关系紧凑、跨度合理 | \(R_{\mathrm{edge}}\)      |
| 连线少交叉         | \(R_{\mathrm{cross}}\)     |
| 更新后位置稳定     | \(R_{\mathrm{stability}}\) |

**有一个必要边界：固定画布不一定容得下给定 DAG。** 如果节点尺寸、最小间距和最长谱系链已经超过画布容量，那么 \(\mathcal F=\varnothing\)，任何正则项都无法解决。此时需要允许缩放、扩大可滚动画布，或折叠部分支系。