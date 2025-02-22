<template>
    <div class="modal-overlay" v-if="visible">
        <div class="modal">
            <div class="modal-header">
                <h3>{{ title }}</h3>
                <button @click="close" class="close-button">&times;</button>
            </div>
            <div class="modal-body">
                <slot></slot>
            </div>
            <div class="modal-footer">
                <button @click="close">Close</button>
            </div>
        </div>
    </div>
</template>

<script>
export default {
    props: {
        title: {
            type: String,
            default: 'Modal Title'
        },
        visible: {
            type: Boolean,
            default: false
        }
    },
    methods: {
        close() {
            this.$emit('close');
        }
    }
};
</script>

<style scoped>
.modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
}

.modal {
    position: absolute;
    top: 0;
    background: white;
    padding: 20px;
    border-radius: 5px;
    width: 500px;
    max-width: 100%;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
    z-index: 1000;
}

.modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    z-index: 1000;
}

.close-button {
    background: none;
    border: none;
    font-size: 1.5em;
    cursor: pointer;
}

.modal-body {
    margin-top: 10px;
    margin-bottom: 10px;
}

.modal-footer {
    display: flex;
    justify-content: flex-end;
}

form {
    display: flex;
    flex-direction: column;
}

form div {
    margin-bottom: 10px;
}

form label {
    margin-bottom: 5px;
}

form input {
    padding: 5px;
    font-size: 1em;
}

form button {
    padding: 10px;
    font-size: 1em;
    cursor: pointer;
}
</style>