import streamlit as st
import pandas as pd
import plotly.express as px
from supabase import create_client
from datetime import datetime, timedelta
import requests

# ==============================================================================
# [1] 기본 설정 및 연결
# ==============================================================================
st.set_page_config(page_title="Qoo10 메가와리 인사이트", layout="wide", page_icon="📊")

try:
    SUPABASE_URL = st.secrets["SUPABASE_URL"]
    SUPABASE_KEY = st.secrets["SUPABASE_KEY"]
except:
    st.error("Secrets 설정이 필요합니다.")
    st.stop()

@st.cache_resource
def init_connection():
    return create_client(SUPABASE_URL, SUPABASE_KEY)

supabase = init_connection()

@st.cache_data
def convert_df(df):
    return df.to_csv(index=False).encode('utf-8-sig')

# ==============================================================================
# 데이터 및 즐겨찾기 관련 함수
# ==============================================================================
def load_favorites():
    """DB에서 즐겨찾기 브랜드와 색상 정보를 가져옴"""
    try:
        res = supabase.table("brand_favorites").select("*").execute()
        return {item['brand_name']: item['color_code'] for item in res.data}
    except:
        return {}

def save_favorite(brand, color):
    """DB에 즐겨찾기 추가/수정"""
    supabase.table("brand_favorites").upsert({"brand_name": brand, "color_code": color}).execute()

def delete_favorite(brand):
    """DB에서 즐겨찾기 삭제"""
    supabase.table("brand_favorites").delete().eq("brand_name", brand).execute()

# 앱 실행 시 세션 초기화
if "fav_map" not in st.session_state:
    st.session_state.fav_map = load_favorites()
if "selected_brands" not in st.session_state:
    st.session_state.selected_brands = []

# ==============================================================================
# [2] 데이터 로드
# ==============================================================================
@st.cache_data(ttl=60) 
def load_data():
    all_data = []
    start = 0
    batch_size = 1000
    
    while True:
        response = supabase.table("qoo10_rankings").select("*").order("collected_at", desc=True).range(start, start + batch_size - 1).execute()
        if not response.data: break
        all_data.extend(response.data)
        if len(response.data) < batch_size: break
        start += batch_size
        
    df = pd.DataFrame(all_data)
    og_df = df.copy()
    if not df.empty:
        df['rank'] = pd.to_numeric(df['rank'], errors='coerce')
        df['sale_price'] = pd.to_numeric(df['sale_price'], errors='coerce')
        df['review_count'] = pd.to_numeric(df['review_count'], errors='coerce')
        df['collected_at'] = pd.to_datetime(df['collected_at'])
        df['collected_at'] = df['collected_at'] + pd.Timedelta(hours=9)
        df['display_time'] = df['collected_at'].dt.strftime('%m/%d %H시')
        df['date_only'] = df['collected_at'].dt.date
        cols = ['large_category', 'medium_category', 'small_category', 'brand']
        df[cols] = df[cols].fillna("기타")
        
    return df, og_df

# ==============================================================================
# [3] 메인 화면 로직
# ==============================================================================

st.markdown("""
    <style>
    /* 구분선(hr) */
    hr {
        margin: 0.7rem 0px !important;
    }
    </style>
""", unsafe_allow_html=True)

def trigger_github_action():
    token = st.secrets["GITHUB_TOKEN"]
    owner = st.secrets["GITHUB_OWNER"]
    repo = st.secrets["GITHUB_REPO"]
    workflow_file = "main.yml" 
    url = f"https://api.github.com/repos/{owner}/{repo}/actions/workflows/{workflow_file}/dispatches"
    headers = {"Authorization": f"token {token}", "Accept": "application/vnd.github.v3+json"}
    data = {"ref": "main"}
    response = requests.post(url, headers=headers, json=data)
    if response.status_code == 204:
        st.sidebar.success("✅ 수집 명령을 보냈습니다!")
    else:
        st.sidebar.error(f"❌ 실행 실패: {response.status_code}")

st.title("📊 Qoo10 메가와리 랭킹 인사이트")

with st.spinner('데이터 분석 중...'):
    df, og_df = load_data()

if df.empty:
    st.warning("데이터가 없습니다. 수집기를 먼저 실행해주세요.")
else:
    # --- 사이드바 필터 ---
    st.sidebar.header("🔍 데이터 필터")

    # 1. 행사 SID (디폴트: 전체)
    events = sorted(df['event_sid'].unique(), reverse=True)
    events.insert(0, "전체 (All Events)")
    sel_event = st.sidebar.selectbox("1. 행사(SID) 선택", events, index=0)
    f1_df = df if sel_event == "전체 (All Events)" else df[df['event_sid'] == sel_event]

    # 2. 브랜드 필터 & 즐겨찾기 설정 (익스팬더)
    st.sidebar.markdown("2. 브랜드 필터")
    all_brands = sorted(f1_df['brand'].unique())

    with st.sidebar.expander("⭐ 즐겨찾기 관리", expanded=False):
        c_reg1, c_reg2 = st.columns([3, 1])
        with c_reg1:
            reg_brand = st.selectbox("브랜드", all_brands, key="reg_box", label_visibility="collapsed")
        with c_reg2:
            reg_color = st.color_picker("색상", "#FF4B4B", label_visibility="collapsed")
        
        if st.button("💾 저장/수정", use_container_width=True):
            save_favorite(reg_brand, reg_color)
            st.session_state.fav_map = load_favorites()
            st.rerun()

        st.divider()
        st.markdown("**저장된 즐겨찾기 목록**")
        
        if not st.session_state.fav_map:
            st.caption("저장된 브랜드가 없습니다.")
        else:
            for b, c in st.session_state.fav_map.items():
                mc1, mc2, mc3 = st.columns([6, 1, 3])
                
                mc1.markdown(f'<div style="display: flex; align-items: center; height: 2.5rem; font-size: 0.9rem;">{b}</div>', unsafe_allow_html=True)
                
                mc2.markdown(f'''
                    <div style="display: flex; align-items: center; justify-content: center; height: 2.5rem;">
                        <div style="background-color:{c}; width:0.9rem; height:0.9rem; border-radius:3px;"></div>
                    </div>
                ''', unsafe_allow_html=True)
                
                if mc3.button("🗑️", key=f"del_{b}", use_container_width=True):
                    delete_favorite(b)
                    st.session_state.fav_map = load_favorites()
                    st.toast(f"{b} 삭제됨")
                    st.rerun()
                        
    # 3. 브랜드 선택 버튼
    c_f1, c_f2 = st.sidebar.columns(2)
    with c_f1:
        if st.button("✅ 즐겨찾기", use_container_width=True):
            st.session_state.selected_brands = [b for b in st.session_state.fav_map.keys() if b in all_brands]
    with c_f2:
        if st.button("🔄 전체 해제", use_container_width=True):
            st.session_state.selected_brands = []
    
    # 멀티셀렉트
    st.session_state.selected_brands = st.sidebar.multiselect(
        "브랜드 선택", options=all_brands, default=st.session_state.selected_brands, label_visibility="collapsed"
    )
    f2_df = f1_df[f1_df['brand'].isin(st.session_state.selected_brands)] if st.session_state.selected_brands else f1_df

    # 3. 랭킹 기준 (디폴트: 누적건수)
    r_types = sorted(f2_df['rank_type'].unique())
    d_idx_r = r_types.index('누적건수') if '누적건수' in r_types else 0
    sel_type = st.sidebar.selectbox("3. 랭킹 기준", r_types, index=d_idx_r)
    f3_df = f2_df[f2_df['rank_type'] == sel_type]

    # 4. 타겟 (디폴트: 뷰티전체)
    cats = sorted(f3_df['category'].unique())
    d_idx_c = cats.index('뷰티전체') if '뷰티전체' in cats else 0
    sel_cat = st.sidebar.selectbox("4. 타겟(연령/카테고리)", cats, index=d_idx_c)
    f4_df = f3_df[f3_df['category'] == sel_cat]

    # 5. 기간 설정
    min_d, max_d = f4_df['date_only'].min(), f4_df['date_only'].max()
    date_range = st.sidebar.date_input("5. 조회 기간", value=(min_d, max_d))
    if len(date_range) == 2:
        f5_df = f4_df[(f4_df['date_only'] >= date_range[0]) & (f4_df['date_only'] <= date_range[1])]
    else:
        f5_df = f4_df

    # 6. 브랜드 상위 N개 (디폴트: 전체)
    sel_n = st.sidebar.selectbox("6. 상위 N개 항목만 보기", ["전체", 5, 10, 15, 20, 30, 50], index=0)
    
    # [핵심] 에러 방지를 위해 변수 최종 할당
    final_df = f5_df

    # 8. 다른 버튼들
    st.sidebar.divider()
    if st.sidebar.button("🚀 데이터 수집 즉시 실행", use_container_width=True):
        trigger_github_action()
    if st.sidebar.button("🔄 데이터 즉시 새로고침", use_container_width=True):
        st.cache_data.clear()
        st.rerun()

    st.sidebar.markdown("---")
    file_label = sel_event if sel_event != "전체 (All Events)" else "All_Events"
    st.sidebar.download_button("🔍 현재 데이터 받기", convert_df(final_df), "filtered_data.csv", "text/csv")
    st.sidebar.download_button("💾 전체 원본 받기", convert_df(og_df), f"Raw_{file_label}.csv", "text/csv")

    # ==========================================================================
    # [4] 시각화
    # ==========================================================================
    st.divider()
    
    def filter_top_n(dataframe, group_col, n_limit):
        if n_limit == "전체": return dataframe
        top_items = dataframe.groupby(group_col)['rank'].min().sort_values().head(n_limit).index.tolist()
        return dataframe[dataframe[group_col].isin(top_items)]

    tab1, tab2, tab3 = st.tabs(["📈 순위 트렌드", "💰 가격/리뷰 분석", "🔲 카테고리 점유율"])
    color_map = st.session_state.fav_map

    with tab1:
        col1, col2 = st.columns(2)
        with col1:
            st.subheader(f"🏢 브랜드 Top {sel_n} 순위")
            if not final_df.empty:
                chart_df = filter_top_n(final_df, 'brand', sel_n)
                brand_trend = chart_df.groupby(['collected_at', 'brand'])['rank'].min().reset_index()
                fig = px.line(brand_trend, x='collected_at', y='rank', color='brand', markers=True, 
                              color_discrete_map=color_map, title="브랜드별 최고 순위")
                fig.update_yaxes(autorange="reversed")
                fig.update_xaxes(type='category', categoryorder='category ascending')
                st.plotly_chart(fig, use_container_width=True)

        with col2:
            st.subheader(f"📦 상품 Top {sel_n} 순위")
            if not final_df.empty:
                chart_df = filter_top_n(final_df, 'goods_no', sel_n)
                last_names = chart_df.groupby('goods_no')['goods_name'].last().to_dict()
                chart_df['unified_name'] = chart_df['goods_no'].map(last_names)
                chart_df['legend_label'] = chart_df.apply(lambda r: f"{r['unified_name'][:10]}.. (#{str(r['goods_no'])[-4:]})", axis=1)
                
                # 브랜드 색상으로 통일하되 상품별로 선 구분
                fig = px.line(chart_df, x="collected_at", y="rank", color="brand", line_group="goods_no",
                              hover_name="unified_name", color_discrete_map=color_map, markers=True, title="상품별 순위 (브랜드 색상 동기화)")
                fig.update_yaxes(autorange="reversed")
                fig.update_xaxes(type='category', categoryorder='category ascending')
                st.plotly_chart(fig, use_container_width=True)

    with tab2:
        col3, col4 = st.columns(2)
        with col3:
            st.subheader("🔵 가격 vs 리뷰")
            if not final_df.empty:
                chart_df = filter_top_n(final_df, 'goods_no', sel_n).drop_duplicates(subset=['goods_no'], keep='last')
                fig = px.scatter(chart_df, x="sale_price", y="rank", size="review_count", color="brand", color_discrete_map=color_map,
                                 hover_data=["goods_name"], title="가격/리뷰 분포")
                fig.update_yaxes(autorange="reversed")
                st.plotly_chart(fig, use_container_width=True)
        with col4:
            st.subheader("💰 카테고리별 가격대")
            if not final_df.empty:
                fig = px.box(final_df, x="medium_category", y="sale_price", color="medium_category", points="all")
                st.plotly_chart(fig, use_container_width=True)

    with tab3:
        col5, col6 = st.columns(2)
        with col5:
            st.subheader("🔲 카테고리 점유율")
            if not final_df.empty:
                fig = px.treemap(final_df, path=[px.Constant("전체"), 'large_category', 'medium_category', 'brand'], 
                                 values='sale_price', color='brand', color_discrete_map=color_map)
                st.plotly_chart(fig, use_container_width=True)
        with col6:
            st.subheader("☀️ 세부 계층 구조")
            if not final_df.empty:
                fig = px.sunburst(final_df, path=['large_category', 'medium_category', 'small_category'], values='sale_price')
                st.plotly_chart(fig, use_container_width=True)

    with st.expander("📋 필터링된 데이터 원본 보기"):
        view_cols = ['display_time', 'rank', 'brand', 'goods_name', 'sale_price', 'review_count']
        st.dataframe(final_df.sort_values(by=['collected_at', 'rank'])[view_cols], use_container_width=True, hide_index=True)















